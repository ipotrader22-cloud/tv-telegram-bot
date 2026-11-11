'use strict';
// Previous-session Google Finance news is read-only display data, not strategy input.
const {previousSession}=require('../scripts/swing-market-calendar');
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
 const end=page.indexOf('<c-data id=',start),html=page.slice(start,end>start?Math.min(end,start+40000):start+40000);
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
 const items=[],seen=new Set();
 for(const card of cards.slice(0,6)){
  const approximate=ageEstimate(card.relative,reference,sessionDate);
  if(!approximate)continue;
  let meta={date:null,description:null};
  const domain=new URL(card.url).hostname;
  const allowed=['zacks.com','finance.yahoo.com','marketwatch.com','reuters.com',
   'businesswire.com','prnewswire.com','seekingalpha.com','benzinga.com',
   'investing.com','fool.com','gurufocus.com','gdnonline.com','barrons.com'];
  if(allowed.some(name=>domain===name||domain.endsWith('.'+name))){
   try{meta=articleMetadata((await textResponse(card.url,fetcher,450000,3500)).text)}catch{}
  }
  // An article's verified original date overrides and can veto a relative
  // Google Finance card: mismatches are never silently backdated.
  if(meta.date&&(etParts(meta.date).day!==sessionDate||Date.parse(meta.date)>now.getTime()))continue;
  const when=meta.date?{time:meta.date,label:formatTime(meta.date),precision:'exact'}:approximate;
  const distinct=card.title.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(seen.has(distinct))continue;
  seen.add(distinct);
  items.push({ticker,summary:summary(card,meta.description,ticker,company),
   headline:card.title,publisher:card.source,url:card.url,published_et:when.label,
   published_utc:when.precision==='exact'?when.time:null,time_precision:when.precision,
   sort_time:when.time});
 }
 items.sort((a,b)=>b.sort_time.localeCompare(a.sort_time));
 return items.slice(0,2);
}
function createCompanyNewsReader({clock=()=>new Date(),fetcher=fetch,load=collect}={}){
 const cache=new Map(),pending=new Map();
 return async base=>{
  if(!base?.available||!base.data)return base;
  const now=clock(),sessionDate=previousSession(etParts(now).day);
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
   new Promise(resolve=>setTimeout(resolve,1800))]);
  return {...base,data:{...base.data,company_news_read_only:true,
   company_news_session_date:sessionDate,
   active_portfolio:entries.map(({p,key})=>{
    const entry=cache.get(key);
    return {...p,company_news:entry?.items||[],company_news_status:entry?.status||'PENDING',
     company_news_session_date:sessionDate};
   })}};
 };
}
module.exports={TTL_MS,RETRY_MS,decode,safeUrl,companyName,relevant,parseCards,
 ageEstimate,articleMetadata,summary,collect,createCompanyNewsReader};
