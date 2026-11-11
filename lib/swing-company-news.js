'use strict';
// Previous-session Google Finance news is read-only display data, not strategy input.
const {previousSession,session}=require('../scripts/swing-market-calendar');
const {etParts}=require('./swing-intraday-valuation');
const TTL_MS=15*60000,RETRY_MS=5*60000;
function decode(s){
 return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#x27);/gi,x=>({
  '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&#39;':"'",'&#x27;':"'"
 })[x.toLowerCase()]||x).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function safeUrl(href){
 try{
  const u=new URL(decode(href));
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     !u.hostname.includes('.')||u.hostname.length>180||
     /(^|\.)(localhost|internal|local)$/.test(u.hostname)||
     /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.includes(':'))return null;
  u.hash='';return u.href;
 }catch{return null}
}
function companyName(page,ticker){
 const title=decode(page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
 const idx=title.indexOf(' ('+ticker+')');
 return idx>0&&idx<120?title.slice(0,idx)
  .replace(/\s+(?:Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|plc)$/i,'').trim():null;
}
function relevant(text,ticker,company){
 const s=decode(text).toLowerCase(),word=ticker.toLowerCase().replace(/\./g,'\\.');
 return new RegExp('(^|[^a-z0-9])'+word+'([^a-z0-9]|$)').test(s)||
  (company.length>=4&&s.includes(company.toLowerCase()));
}
function parseCards(page,ticker){
 if(typeof page!=='string'||page.length>2400000)throw Error('GOOGLE_NEWS_PAGE_INVALID');
 const start=page.indexOf('>News stories</div>');
 if(start<0)throw Error('GOOGLE_NEWS_SECTION_MISSING');
 const company=companyName(page,ticker);
 if(!company)throw Error('GOOGLE_NEWS_COMPANY_UNVERIFIED');
 // Some tickers have a long related-stocks block before their own news cards.
 const end=page.indexOf('<c-data id=',start),html=page.slice(start,end>start?Math.min(end,start+160000):start+160000);
 const seen=new Set(),cards=[];
 for(const m of html.matchAll(/<div class="LIT7If">([\s\S]*?)(?=<div class="LIT7If">|<div class="VfPpkd)/g)){
  const block=m[1],url=safeUrl(block.match(/<a href="([^"]+)"[^>]*>/)?.[1]),
   title=decode(block.match(/<div class="TQWIEd">([\s\S]*?)<\/div>/)?.[1]),
   source=decode(block.match(/<div class="WrUjhf">([\s\S]*?)<\/div>/)?.[1]),
   relative=decode(block.match(/<div class="JQ8Czd">([\s\S]*?)<\/div>/)?.[1]);
  if(url&&title&&source&&relative&&!seen.has(url)&&relevant(title,ticker,company)){
   seen.add(url);cards.push({url,title:title.slice(0,180),source:source.slice(0,80),relative});
  }
  if(cards.length===8)break;
 }
 return {company,cards};
}
function ageEstimate(relative,now,sessionDate){
 const match=/^(\d{1,3}) (hour|minute)s? ago$/i.exec(relative);
 if(!match)return null;
 const step=match[2].toLowerCase()==='hour'?3600000:60000,n=Number(match[1]);
 if(n<1||n>48)return null;
 const latest=new Date(now.getTime()-n*step),earliest=new Date(now.getTime()-(n+1)*step);
 if(etParts(latest).day!==sessionDate||etParts(earliest).day!==sessionDate)return null;
 const label=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  month:'short',day:'numeric',year:'numeric',hour:'numeric',
  minute:step===60000?'2-digit':undefined}).format(latest)+' ET (approx.)';
 return {time:latest.toISOString(),label,precision:'approximate'};
}
// Fallback to the latest independently dated Google Finance story when the
// chosen trading session has no relevant article. A coarse relative "days ago"
// estimate must never be presented as an exact publisher posting time.
function relativeEstimate(relative,now){
 const m=/^(\d{1,3}) (minute|hour|day|week)s? ago$/i.exec(relative);
 if(!m)return null;
 const step={minute:60000,hour:3600000,day:86400000,week:604800000}[m[2].toLowerCase()];
 const count=Number(m[1]);
 if(!step||count<1||count*step>90*86400000)return null;
 const latest=new Date(now.getTime()-count*step),earliest=new Date(latest.getTime()-step);
 if(!Number.isFinite(latest.getTime())||latest.getTime()>now.getTime())return null;
 const fine=step<=3600000;
 const label=fine
  ?formatTime(latest)+' (approx.)'
  :'About '+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
   month:'short',day:'numeric',year:'numeric'}).format(latest)+' ET (Google Finance estimate; exact time unavailable)';
 return {time:latest.toISOString(),label,precision:'approximate',rangeStart:earliest.toISOString(),
  sessionDay:etParts(latest).day};
}
function articleMetadata(page){
 if(typeof page!=='string'||page.length>450000)return {date:null,description:null};
 const tags=[...page.matchAll(/<meta\b[^>]*>/gi)].slice(0,250);
 let date=null,description=null;
 for(const match of tags){
  const attrs={},r=/([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  for(const a of match[0].matchAll(r))attrs[a[1].toLowerCase()]=decode(a[3]);
  const name=(attrs.name||attrs.property||attrs.itemprop||'').toLowerCase();
  if(['article:published_time','datepublished','pubdate'].includes(name)&&!date)date=attrs.content||null;
  if(['description','og:description'].includes(name)&&!description)description=attrs.content||null;
 }
 if(!date){
  for(const m of page.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
   if(m[1].length>70000)continue;
   try{
    const nodes=[JSON.parse(m[1])];
    while(nodes.length){
     const o=nodes.pop();
     if(Array.isArray(o)){nodes.push(...o);continue}
     if(!o||typeof o!=='object')continue;
     const type=String(o['@type']||'');
     if(/NewsArticle|Article|BlogPosting/.test(type)&&typeof o.datePublished==='string'){
      date=o.datePublished;if(!description&&typeof o.description==='string')description=o.description;break;
     }
     if(o['@graph'])nodes.push(o['@graph']);
    }
   }catch{}
   if(date)break;
  }
 }
 if(date&&!/T\d\d:\d\d/.test(date))date=null;
 if(date&&!/(Z|[+-]\d\d:?\d\d)$/.test(date))date=null;
 const timestamp=date?new Date(date):null;
 return {date:timestamp&&Number.isFinite(timestamp.getTime())?timestamp.toISOString():null,
  description:description?description.slice(0,390):null};
}
function formatTime(iso){
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso))+' ET';
}
function summary(card,desc,ticker,company){
 const d=decode(desc),usable=d.length>=25&&d.length<=350&&relevant(d,ticker,company)&&
  !/subscribe now|cookie policy|read more at|copyright/i.test(d);
 const text=(usable?d:card.title).replace(/\s+/g,' ').trim().slice(0,230);
 return /[.!?]$/.test(text)?text:text+'.';
}
async function textResponse(url,fetcher,maxBytes,timeout){
 const r=await fetcher(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; VixaleNews/1.0)',
  'accept-language':'en-US,en;q=0.9'},redirect:'error',signal:AbortSignal.timeout(timeout)});
 if(!r?.ok||Number(r.headers?.get?.('content-length')||0)>maxBytes)throw Error('GOOGLE_NEWS_HTTP_FAILED');
 const text=await r.text();
 if(text.length>maxBytes)throw Error('GOOGLE_NEWS_TOO_LARGE');
 return {text,date:r.headers?.get?.('date')||null};
}
async function collect({ticker,exchange,sessionDate,now,fetcher=fetch}){
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker||'')||
    !/^(NYSE|NASDAQ|AMEX|BATS)$/.test(exchange||''))throw Error('GOOGLE_NEWS_IDENTITY_INVALID');
 const url='https://www.google.com/finance/quote/'+encodeURIComponent(ticker+':'+exchange)+'?hl=en&gl=US';
 const response=await textResponse(url,fetcher,2400000,6500);
 const {company,cards}=parseCards(response.text,ticker),reported=new Date(response.date||'');
 const reference=Number.isFinite(reported.getTime())&&Math.abs(reported-now)<=300000?reported:now;
 const seen=new Set();
 // Check a bounded number of publisher pages concurrently, not sequentially:
 // serial 3.5s calls previously left several positions stuck on PENDING.
 const candidate=await Promise.all(cards.slice(0,4).map(async card=>{
  let meta={date:null,description:null};
  const domain=new URL(card.url).hostname;
  const allowed=['zacks.com','finance.yahoo.com','marketwatch.com','reuters.com',
   'businesswire.com','prnewswire.com','seekingalpha.com','benzinga.com',
   'investing.com','fool.com','gurufocus.com','gdnonline.com','barrons.com'];
  if(allowed.some(name=>domain===name||domain.endsWith('.'+name))){
   try{meta=articleMetadata((await textResponse(card.url,fetcher,450000,1200)).text)}catch{}
  }
  return {card,meta};
 }));
 const items=[];
 for(const {card,meta} of candidate){
  const relative=relativeEstimate(card.relative,reference);
  if(meta.date&&Date.parse(meta.date)>now.getTime())continue;
  const precise=meta.date?{
   time:meta.date,label:formatTime(meta.date),precision:'exact',
   sessionDay:etParts(meta.date).day}:null;
  const when=precise||relative;
  if(!when)continue;
  const distinct=card.title.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(seen.has(distinct))continue;
  seen.add(distinct);
  const isCurrent=when.sessionDay===sessionDate&&
   (when.precision==='exact'||!when.rangeStart||
    etParts(when.rangeStart).day===sessionDate);
  items.push({ticker,summary:summary(card,meta.description,ticker,company),
   headline:card.title,publisher:card.source,url:card.url,published_et:when.label,
   published_utc:when.precision==='exact'?when.time:null,time_precision:when.precision,
   news_is_older:!isCurrent,sort_time:when.time,news_provider:'GOOGLE_FINANCE'});
 }
 const today=items.filter(item=>!item.news_is_older);
 const selected=today.length?today:items.filter(item=>item.news_is_older);
 selected.sort((a,b)=>b.sort_time.localeCompare(a.sort_time));
 return selected.slice(0,2);
}
// Use the latest NYSE trading date, including today's session once the
// regular session opens. Before 09:30 ET and on market holidays/weekends,
// the last completed session is the relevant news date.
function latestNewsSession(now){
 const et=etParts(now),calendar=session(et.day);
 return calendar.open&&et.minute>=570?et.day:previousSession(et.day);
}
// Google Finance News stories can contain only unrelated market headlines.
// In that case Google News RSS offers a bounded company-specific fallback.
function googleNewsRecords(xml,{ticker,company,sessionDate,now}){
 if(typeof xml!=='string'||xml.length>600000||!/<rss\b/.test(xml))throw Error('GOOGLE_NEWS_RSS_INVALID');
 const records=[],seen=new Set();
 for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){
  const item=match[1],extract=name=>{
   const pattern=new RegExp('<'+name+'(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i');
   const raw=item.match(pattern)?.[1]||'';
   return decode(raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1'));
  };
  const headline=extract('title'),url=safeUrl(extract('link')),publisher=extract('source');
  const timestamp=new Date(extract('pubDate')),published=timestamp.getTime();
  if(!url||new URL(url).hostname!=='news.google.com'||!publisher||!headline||
     !Number.isFinite(published)||published>now.getTime()+60000||
     now.getTime()-published>90*86400000||!relevant(headline,ticker,company))continue;
  const normalized=headline.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(seen.has(normalized))continue;
  seen.add(normalized);
  const current=etParts(timestamp).day===sessionDate;
  // Google News reports syndication time, not a verified original article date.
  const label=formatTime(timestamp.toISOString())+' (Google News)';
  const suffix=' - '+publisher,rawTitle=headline.toLowerCase().endsWith(suffix.toLowerCase())
   ?headline.slice(0,-suffix.length).trim():headline;
  records.push({ticker,summary:/[.!?]$/.test(rawTitle)?rawTitle:rawTitle+'.',
   headline:rawTitle,publisher,url,published_et:label,published_utc:timestamp.toISOString(),
   time_precision:'google_news',news_provider:'GOOGLE_NEWS_RSS',
   news_is_older:!current,sort_time:timestamp.toISOString()});
 }
 const todays=records.filter(x=>!x.news_is_older);
 return (todays.length?todays:records).sort((a,b)=>b.sort_time.localeCompare(a.sort_time)).slice(0,2);
}
async function collectWithFallback(args){
 let primary=[];
 try{primary=await collect(args)}catch{}
 if(primary.length)return primary;
 const {ticker,exchange,sessionDate,now,fetcher=fetch}=args;
 if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker||'')||
    !/^(NYSE|NASDAQ|AMEX|BATS)$/.test(exchange||''))return [];
 try{
  // The scoped Finance quote page establishes the company's actual name.
  // Never infer company identity or accept arbitrary Google News matches.
  const finance='https://www.google.com/finance/quote/'+encodeURIComponent(ticker+':'+exchange)+'?hl=en&gl=US';
  const page=await textResponse(finance,fetcher,2400000,4000);
  const company=companyName(page.text,ticker);
  if(!company)return [];
  const q=encodeURIComponent('"'+company+'" '+ticker+' stock');
  const rss='https://news.google.com/rss/search?q='+q+'&hl=en-US&gl=US&ceid=US:en';
  const response=await textResponse(rss,fetcher,600000,4500);
  return googleNewsRecords(response.text,{ticker,company,sessionDate,now});
 }catch{return []}
}
function createCompanyNewsReader({clock=()=>new Date(),fetcher=fetch,load=collectWithFallback}={}){
 const cache=new Map(),pending=new Map(),visible=new Map();
 return async base=>{
  if(!base?.available||!base.data)return base;
  const now=clock(),sessionDate=latestNewsSession(now);
  const positions=base.data.active_portfolio||[];
  const entries=positions.map(p=>{
   const key=sessionDate+'|'+p.exchange+'|'+p.ticker,entry=cache.get(key);
   if((!entry||now-entry.at>(entry.status==='UNAVAILABLE'?RETRY_MS:TTL_MS))&&!pending.has(key)){
    const promise=Promise.resolve().then(()=>load({ticker:p.ticker,exchange:p.exchange,sessionDate,now,fetcher}))
     .then(items=>cache.set(key,{at:clock().getTime(),status:items.length?'READY':'NO_VERIFIED_NEWS',items}))
     .catch(()=>cache.set(key,{at:clock().getTime(),status:'UNAVAILABLE',items:[]}))
     .finally(()=>pending.delete(key));
    pending.set(key,promise);
   }
   return {p,key};
  });
  if(pending.size)await Promise.race([Promise.allSettled([...pending.values()]),
   new Promise(resolve=>setTimeout(resolve,2900))]);
  return {...base,data:{...base.data,company_news_read_only:true,
   company_news_session_date:sessionDate,
   active_portfolio:entries.map(({p,key})=>{
    // Freeze each visible news projection for one minute so independent
    // authenticated API and HTML requests cannot receive different fingerprints.
    let projection=visible.get(key);
    if(!projection||now.getTime()-projection.at>=60000){
     projection={at:now.getTime(),news:cache.get(key)||{items:[],status:'PENDING'}};
     visible.set(key,projection);
    }
    const entry=projection.news;
    return {...p,company_news:entry.items||[],company_news_status:entry.status,
     company_news_session_date:sessionDate};
   })}};
 };
}
module.exports={TTL_MS,RETRY_MS,decode,safeUrl,companyName,relevant,parseCards,
 ageEstimate,relativeEstimate,articleMetadata,summary,collect,googleNewsRecords,collectWithFallback,latestNewsSession,createCompanyNewsReader};
