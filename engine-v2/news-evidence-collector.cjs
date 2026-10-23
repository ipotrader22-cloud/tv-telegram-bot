'use strict';
// Source-backed news coverage collector for Engine2 research. A successful
// headline fetch proves coverage, NOT a catalyst score or bullish sentiment.
// All article links, publication dates and source hashes are private evidence.
const {createHash}=require('node:crypto');
function plain(s=''){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
 .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
 .replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim()};
const extract=(xml,tag)=>{
 const m=xml.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));
 return m?plain(m[1]):'';
};
function parseNewsRss(xml,{ticker,checkedAt}={}){
 if(typeof xml!=='string'||xml.length>1024*1024||!/<rss[\s>]/i.test(xml)||!/<channel[\s>]/i.test(xml)||!/<\/channel>/i.test(xml))
  throw Error('RSS_SOURCE_NOT_VALID');
 const items=(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[]).slice(0,30);
 const earliest=Date.parse(checkedAt)-7*86400000;
 return items.map(item=>({
  title:extract(item,'title'),url:extract(item,'link'),publishedAt:extract(item,'pubDate'),
  source:extract(item,'source')
 })).filter(item=>item.title.length>8&&/^https:\/\//.test(item.url)&&
   Number.isFinite(Date.parse(item.publishedAt))&&Date.parse(item.publishedAt)<=Date.parse(checkedAt)&&
   Date.parse(item.publishedAt)>=earliest);
}
async function collectNewsCoverage({companies,date,runAt,fetchFn=fetch,at=new Date().toISOString()}={}){
 const bad=reason=>({status:'BLOCKED',reason,complete:false});
 if(!Array.isArray(companies)||!companies.length||companies.length>40||!date||
  !Number.isFinite(Date.parse(runAt||''))||!Number.isFinite(Date.parse(at||''))||
  at.slice(0,10)!==date||Date.parse(at)>Date.parse(runAt))return bad('INVALID_NEWS_COLLECTION_WINDOW');
 const seen=new Set(),covered=[],evidence=[];
 for(const company of companies){
  const ticker=company?.ticker,name=company?.name;
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker||'')||!name||name.length>100||seen.has(ticker))
   return bad('INVALID_COMPANY_UNIVERSE');
  seen.add(ticker);
  const q=encodeURIComponent('"'+name+'" '+ticker+' stock company news when:7d');
  const url='https://news.google.com/rss/search?q='+q+'&hl=en-US&gl=US&ceid=US:en';
  let articles,raw;
  try{
   const r=await fetchFn(url,{headers:{Accept:'application/rss+xml','Cache-Control':'no-cache'},
    signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!r.ok)throw Error('NEWS_HTTP_'+r.status);
   raw=await r.text();articles=parseNewsRss(raw,{ticker,checkedAt:at});
  }catch{return bad('NEWS_PROVIDER_UNAVAILABLE:'+ticker)}
  covered.push(ticker);
  evidence.push({ticker,query:url,checkedAt:at,
   sourceId:'GOOGLENEWS_RSS_SHA256:'+createHash('sha256').update(raw).digest('hex'),
   articles,articlesCount:articles.length});
 }
 const hash=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 return {status:'COVERAGE_COMPLETE_SCORING_PENDING',date,checkedAt:at,complete:true,
  tickers:covered,sourceId:'VIXALE_NEWS_REVIEW_SHA256:'+hash,evidence,
  catalystScoresAssigned:false};
}
module.exports={parseNewsRss,collectNewsCoverage};
