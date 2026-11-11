'use strict';
// Google News reading is a website-only projection. No scoring or ledger writes.
const {session,previousSession}=require('../scripts/swing-market-calendar');
const {etParts}=require('./swing-intraday-valuation');
const KNOWN=Object.freeze({AIZ:'Assurant',EXR:'Extra Space Storage',PSA:'Public Storage',VTRS:'Viatris'});
const TTL=15*60000,FAIL_TTL=5*60000;
function escapeRegex(x){return String(x).replace(/[^a-zA-Z0-9 ]/g,'\\$&')}
function decode(value){
 const m={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
 return String(value||'').replace(/&#(x[0-9a-f]+|[0-9]+);|&([a-z]+);/gi,(all,n,k)=>{
  if(k)return m[k.toLowerCase()]??all;
  const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
  return Number.isInteger(c)&&c>=32&&c<=0x10ffff?String.fromCodePoint(c):' ';
 }).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function field(xml,name){
 const match=String(xml).match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
 return match?decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')):'';
}
function tradingDay(now){
 const et=etParts(now);
 return session(et.day).open&&et.minute>=570?et.day:previousSession(et.day);
}
function relevant(headline,name,ticker){
 const company=name.replace(/\b(Inc|Corporation|Corp|Company|Ltd)\.?\b/gi,'').trim();
 return (company.length>=5&&new RegExp('(^|\\W)'+escapeRegex(company)+'($|\\W)','i').test(headline))||
  (new RegExp('(^|[^A-Z])'+escapeRegex(ticker)+'($|[^A-Z])').test(headline)&&
   /\b(stock|shares|earnings|NYSE|NASDAQ|analyst|company|revenue)\b/i.test(headline));
}
function parseRss(xml,{ticker,company,date,now}){
 if(!/<rss\b/i.test(xml)||!/<channel\b/i.test(xml))throw Error('GOOGLE_NEWS_RSS_INVALID');
 const items=String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
 if(items.length>120)throw Error('GOOGLE_NEWS_RSS_TOO_MANY');
 const seen=new Set(),articles=[];
 for(const item of items){
  const published=Date.parse(field(item,'pubDate')),source=field(item,'source').slice(0,80);
  if(!Number.isFinite(published)||published>now.getTime()||etParts(published).day!==date)continue;
  const raw=field(item,'title');
  const title=source?raw.replace(new RegExp('\\s+-\\s+'+escapeRegex(source)+'$','i'),'').trim():raw;
  const url=field(item,'link');
  if(!relevant(title,company,ticker)||title.length<12||title.length>300||
     !/^https:\/\/news\.google\.com\/(rss\/)?articles\/[a-z0-9_%-]+/i.test(url))continue;
  if(seen.has(url))continue;seen.add(url);
  articles.push({summary:title,published_at:new Date(published).toISOString(),
   published_at_et:etParts(published).text,source:source||'Google News partner',url});
 }
 articles.sort((a,b)=>b.published_at.localeCompare(a.published_at));
 return articles.slice(0,2);
}
async function read(url,fetcher=fetch){
 const response=await fetcher(url,{headers:{accept:'application/rss+xml,text/html;q=0.8',
  'user-agent':'VixaleSwingNews/1.0'},signal:AbortSignal.timeout(6500)});
 if(!response?.ok)throw Error('GOOGLE_NEWS_FETCH_UNAVAILABLE');
 const body=await response.text();
 if(body.length>900000)throw Error('GOOGLE_NEWS_BODY_TOO_LARGE');
 return body;
}
async function identity(ticker,exchange,fetcher=fetch){
 if(KNOWN[ticker])return KNOWN[ticker];
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)||!/^(NYSE|NASDAQ|AMEX|BATS)$/.test(exchange))
  throw Error('GOOGLE_NEWS_IDENTITY_INVALID');
 const html=await read('https://www.google.com/finance/quote/'+encodeURIComponent(ticker+':'+exchange)+'?hl=en',fetcher);
 const title=decode(html.match(/<title[^>]*>([\s\S]{1,250}?)<\/title>/i)?.[1]);
 const match=title.match(/^(.{5,100}?)\s+\(([A-Z0-9.-]+)\)\s+Stock Price\s*&\s*News\s+-\s+Google Finance/i);
 if(!match||match[2]!==ticker)throw Error('GOOGLE_NEWS_COMPANY_UNVERIFIED');
 return match[1].trim();
}
async function tickerNews({ticker,exchange,date,now,fetcher=fetch}){
 const company=await identity(ticker,exchange,fetcher);
 const url='https://news.google.com/rss/search?'+new URLSearchParams({
  q:'"'+company.replace(/"/g,'')+'" stock',hl:'en-US',gl:'US',ceid:'US:en'});
 const articles=parseRss(await read(url,fetcher),{ticker,company,date,now});
 return {status:articles.length?'VERIFIED':'NO_ARTICLES',articles,day:date,
  source:'Google News',company,
  finance_url:'https://www.google.com/finance/quote/'+encodeURIComponent(ticker+':'+exchange)};
}
function createCompanyNewsReader({clock=()=>new Date(),provider=tickerNews}={}){
 let cache=new Map(),identityKey='',flight=null;
 return async base=>{
  if(!base?.available||!base.data?.valuation_read_only)return base;
  const now=clock(),date=tradingDay(now),positions=base.data.active_portfolio||[];
  const key=date+'|'+positions.map(p=>p.ticker+':'+p.exchange).join('|');
  if(identityKey!==key){cache=new Map();identityKey=key;}
  const needed=positions.filter(p=>(cache.get(p.ticker)?.expiry||0)<=now.getTime());
  if(needed.length&&!flight){
   flight=(async()=>{
    let i=0;
    await Promise.all(Array.from({length:Math.min(2,needed.length)},async()=>{
     while(i<needed.length){
      const p=needed[i++];let value;
      try{
       value=await provider({ticker:p.ticker,exchange:p.exchange,date,now});
       if(value.day!==date||!['VERIFIED','NO_ARTICLES'].includes(value.status)||!Array.isArray(value.articles))
        throw Error('GOOGLE_NEWS_EVIDENCE_INVALID');
      }catch{value={status:'UNAVAILABLE',articles:[],day:date,source:'Google News'};}
      cache.set(p.ticker,{value,expiry:now.getTime()+(value.status==='UNAVAILABLE'?FAIL_TTL:TTL)});
     }
    }));
   })().finally(()=>{flight=null});
  }
  if(flight)await flight;
  return {...base,data:{...base.data,company_news_day:date,
   active_portfolio:positions.map(p=>({...p,company_news:cache.get(p.ticker)?.value||
    {status:'UNAVAILABLE',articles:[],day:date,source:'Google News'}}))}};
 };
}
module.exports={KNOWN,TTL,FAIL_TTL,decode,field,tradingDay,relevant,parseRss,identity,tickerNews,createCompanyNewsReader};
