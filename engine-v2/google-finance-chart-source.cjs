'use strict';
// Private staging Google Finance chart source. Never broker fills.
// Deterministic 1d/1m response validation; exact exchange symbol, OHLCV and
// session timestamps. No fallback to invented/nearby bars or Yahoo.
const {createHash}=require('node:crypto');
const {localET}=require('./market-data-adapter.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {boundedMap}=require('./bounded-map.cjs');
const {indexUniverse,SECTOR_BENCHMARKS}=require('./index-universe.cjs');
const SYMBOLS=Object.freeze({
 ...indexUniverse().exchanges,
 ...Object.fromEntries(SECTOR_BENCHMARKS.map(t=>[t,t==='SMH'?'NASDAQ':'NYSEARCA'])),
 AMD:'NASDAQ',NVDA:'NASDAQ',AVGO:'NASDAQ',MU:'NASDAQ',AMAT:'NASDAQ',
 MSFT:'NASDAQ',AAPL:'NASDAQ',ORCL:'NYSE',XOM:'NYSE',CVX:'NYSE',
 SPY:'NYSEARCA',QQQ:'NASDAQ',SMH:'NASDAQ',XLK:'NYSEARCA',XLE:'NYSEARCA'
});
const URL_BASE='https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dateParts=date=>date.split('-').map(Number);
function safeDate(date){
 if(!/^20\d\d-\d\d-\d\d$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
  throw Error('GOOGLE_CHART_DATE_INVALID');
 return date;
}
function googleIdentity(ticker){
 if(!Object.hasOwn(SYMBOLS,ticker))throw Error('GOOGLE_CHART_SYMBOL_UNVERIFIED');
 return [ticker,SYMBOLS[ticker]];
}
function decode(text){
 let raw=String(text||'').trim();
 if(raw.startsWith(")]}'"))raw=raw.slice(4).trim();
 let chunks=[];
 try{chunks=[JSON.parse(raw)]}catch{
  for(const line of raw.split('\n'))if(line.trim().startsWith('[['))
   try{chunks.push(JSON.parse(line))}catch{}
 }
 for(const chunk of chunks)for(const part of Array.isArray(chunk)?chunk:[]){
  if(part?.[0]==='wrb.fr'&&typeof part[2]==='string')
   try{return JSON.parse(part[2])}catch{}
 }
 throw Error('GOOGLE_CHART_RESPONSE_INVALID');
}
function parseSeries(raw,ticker,interval,{fromDate,throughDate,allowShortHistory=false}={}){
 const identity=googleIdentity(ticker);
 if(!Array.isArray(raw?.[0]))throw Error('GOOGLE_CHART_SERIES_MISSING');
 const matches=raw[0].filter(s=>Array.isArray(s?.[0])&&
  s[0][0]===identity[0]&&s[0][1]===identity[1]);
 if(matches.length!==1)throw Error('GOOGLE_CHART_SYMBOL_UNVERIFIED');
 const s=matches[0],seconds=interval==='1min'?60:86400;
 if(s?.[8]!==seconds||!Array.isArray(s?.[3]))throw Error('GOOGLE_CHART_INTERVAL_INVALID');
 if(interval==='1day'&&(typeof s[7]!=='string'||s[7].trim().length<3))
  throw Error('GOOGLE_CHART_COMPANY_IDENTITY_MISSING');
 const rows=[],seen=new Set();
 for(const seg of s[3])for(const c of Array.isArray(seg?.[2])?seg[2]:[]){
  if(!Array.isArray(c)||c.length<6)throw Error('GOOGLE_CHART_CANDLE_INVALID');
  const t=Date.parse(c[4]),iso=Number.isFinite(t)?new Date(t).toISOString():null;
  if(!iso)throw Error('GOOGLE_CHART_TIMESTAMP_INVALID');
  const et=localET(iso);
  if(et.date<fromDate||et.date>throughDate)continue;
  if(interval==='1min'){
   const close=String(sessionEvidence(et.date).closeEt||'16:00').split(':').map(Number);
   if(!sessionEvidence(et.date).isTradingDay||
      et.minute<570||et.minute>=close[0]*60+close[1])continue;
   if(t%60000!==0)throw Error('GOOGLE_CHART_TIMESTAMP_INVALID');
  }
  const [open,close,high,low,,volume]=c;
  if([open,close,high,low,volume].some(v=>typeof v!=='number'||!Number.isFinite(v))||
     [open,close,high,low].some(v=>v<=0)||volume<(interval==='1min'?1:0)||
     high<Math.max(open,close,low)||low>Math.min(open,close,high))
   throw Error('GOOGLE_CHART_CANDLE_INVALID');
  const key=interval==='1min'?iso:et.date;
  if(seen.has(key))throw Error('GOOGLE_CHART_DUPLICATE_BAR');
  seen.add(key);
  rows.push({ticker,date:et.date,start:iso,
   end:interval==='1min'?new Date(t+60000).toISOString():null,
   open,high,low,close,volume,
   sourceId:'GOOGLE_CHART_'+(interval==='1min'?'1M':'1D')+':'+ticker+':'+key+':'+digest(c),
   provider:'GOOGLE_FINANCE_CHART',priceKind:interval==='1min'?'MINUTE_BAR_OHLCV':'DAILY_OHLCV',
   session:'REGULAR'});
 }
 rows.sort((a,b)=>a.start.localeCompare(b.start));
 if(interval==='1day'&&rows.length<200&&!allowShortHistory)throw Error('GOOGLE_CHART_DAILY_HISTORY_INCOMPLETE');
 return {ticker,exchange:identity[1],companyName:s[7],rows,sourceHash:digest(s),
  provider:'GOOGLE_FINANCE_CHART',interval};
}
function createGoogleChartSource({fetchFn=fetch,concurrency=1,allowShortHistory=false,allowUnavailable=false}={}){
 async function query(tickers,{fromDate,throughDate,interval}={}){
  safeDate(fromDate);safeDate(throughDate);
  if(fromDate>throughDate||!['1day','1min'].includes(interval)||
     !Array.isArray(tickers)||tickers.length<1||tickers.length>4||
     new Set(tickers).size!==tickers.length)throw Error('GOOGLE_CHART_REQUEST_INVALID');
  const entities=tickers.map(t=>[null,googleIdentity(t)]);
  const args=[entities,null,[dateParts(fromDate),dateParts(throughDate),interval==='1min'?1:6],null,null,null,null,1];
  const build=rpc=>({
   url:URL_BASE+'?rpcids='+rpc+'&hl=en&gl=US',
   body:new URLSearchParams({'f.req':JSON.stringify([[[rpc,JSON.stringify(args),null,'1']]])})
  });
  let response;
  for(const rpc of ['c2u4wc','AiCwsd']){
   const {url,body}=build(rpc);
   try{response=await fetchFn(url,{method:'POST',headers:{
    'accept':'*/*','content-type':'application/x-www-form-urlencoded;charset=UTF-8',
    'origin':'https://www.google.com','referer':'https://www.google.com/finance/beta','x-same-domain':'1'
   },body,signal:AbortSignal.timeout(18000)});}
   catch{throw Error('GOOGLE_CHART_TRANSPORT_FAILED')}
   if(response?.status===403||response?.status===429)
    throw Error('GOOGLE_CHART_ACCESS_RESTRICTED');
   if(response?.status===400&&rpc==='c2u4wc')continue;
   if(!response?.ok)throw Error('GOOGLE_CHART_UPSTREAM_UNAVAILABLE');
   let raw;try{raw=decode(await response.text())}
   catch{throw Error('GOOGLE_CHART_RESPONSE_INVALID')}
   return tickers.map(t=>{
    const identity=googleIdentity(t);
    if(interval==='1day'&&allowUnavailable&&Array.isArray(raw?.[0])&&
       !raw[0].some(s=>s?.[0]?.[0]===identity[0]&&s?.[0]?.[1]===identity[1]))
     return {ticker:t,exchange:identity[1],unavailable:true,sourceHash:digest(raw)};
    try{return parseSeries(raw,t,interval,{fromDate,throughDate,allowShortHistory})}
    catch(error){error.ticker=t;throw error;}
   });
  }
  throw Error('GOOGLE_CHART_RPC_REJECTED');
 }
 async function getDailyMany({tickers,date}={}){
  if(!Array.isArray(tickers)||!tickers.length||new Set(tickers).size!==tickers.length)
   throw Error('GOOGLE_CHART_REQUEST_INVALID');
  const sourceDate=previousSession(safeDate(date)),first=new Date(Date.parse(sourceDate+'T00:00:00Z')-440*86400000).toISOString().slice(0,10);
  const chunks=[];for(let i=0;i<tickers.length;i+=4)chunks.push(tickers.slice(i,i+4));
  const results=(await boundedMap(chunks,concurrency,group=>query(group,{fromDate:first,throughDate:sourceDate,interval:'1day'}))).flat();
  return results.map(s=>{
   if(s.unavailable)return {ticker:s.ticker,exchange:s.exchange,unavailable:true,
    source:'GOOGLE_FINANCE_CHART_1DAY',rawHash:s.sourceHash};
   if(s.rows.at(-1)?.date!==sourceDate||(!allowShortHistory&&s.rows.length<200))
    throw Error('GOOGLE_CHART_DAILY_HISTORY_INCOMPLETE');
   const ts=s.rows.map(c=>Date.parse(c.start)/1000);
   const names=s.rows.map(c=>c.date);
   if(new Set(names).size!==names.length)throw Error('GOOGLE_CHART_DUPLICATE_BAR');
   const exchangeName=s.exchange==='NYSE'?'NYQ':s.exchange==='NASDAQ'?'NMS':'PCX';
   return {ticker:s.ticker,source:'GOOGLE_FINANCE_CHART_1DAY',exchange:s.exchange,
    companyName:s.companyName,rawHash:s.sourceHash,
    chart:{meta:{symbol:s.ticker,exchangeName,longName:s.companyName,
     regularMarketTime:ts.at(-1),regularMarketPrice:s.rows.at(-1).close},
     timestamp:ts,indicators:{quote:[{
      open:s.rows.map(c=>c.open),high:s.rows.map(c=>c.high),
      low:s.rows.map(c=>c.low),close:s.rows.map(c=>c.close),
      volume:s.rows.map(c=>c.volume)}]}}};
  });
 }
 async function getMinuteHistory({ticker,fromDate,throughDate}={}){
  const [series]=await query([ticker],{fromDate,throughDate,interval:'1min'});
  return {ticker,bars:series.rows,sourceHash:series.sourceHash};
 }
 return {getDailyMany,getMinuteHistory};
}
module.exports={SYMBOLS,safeDate,googleIdentity,decode,parseSeries,createGoogleChartSource};
