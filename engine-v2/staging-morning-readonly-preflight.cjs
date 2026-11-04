'use strict';
// Independent pre-session Google-only source readiness; no writes or orders.
// Historical 1m coverage 09:31..prior close, current 09:30 priceopen only
// after ~09:50 ET. No Yahoo RPC or broker access.
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
const ORIGIN='https://vixale-engine-v2-shadow-observer.onrender.com';
async function getJson(path,{fetcher=fetch}={}){
 const r=await fetcher(ORIGIN+path,{method:'GET',redirect:'error',
  headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
 if(!r?.ok)throw Error('SHADOW_HTTP_UNAVAILABLE');
 return r.json();
}
function coverage(bars,date){
 if(!Array.isArray(bars))return false;
 const session=sessionEvidence(date),[hh,mm]=session.closeEt.split(':').map(Number),until=hh*60+mm;
 const seen=new Set();
 for(const b of bars){
  const et=localET(b.start);
  if(et.date!==date||et.minute<571||et.minute>=until)continue;
  if(seen.has(et.minute)||b.provider!=='GOOGLE_FINANCE_CHART'||!b.sourceId?.startsWith('GOOGLE_CHART_1M:'))
   return false;
  seen.add(et.minute);
 }
 for(let m=571;m<until;m++)if(!seen.has(m))return false;
 return seen.size===until-571;
}
async function preflight({now=new Date(),fetcher=fetch,provider=createGoogleChartSource()}={}){
 const et=localET(now.toISOString()),session=sessionEvidence(et.date),prior=previousSession(et.date);
 const result={status:'BLOCKED',date:et.date,sourceSession:prior,minuteET:et.minute,
  readOnly:true,financialWrites:false,productionCutover:false,
  checks:{shadow:'NOT_CHECKED',daily:'NOT_CHECKED',minutes:'NOT_CHECKED',opening:'NOT_DUE'}};
 try{
  const health=await getJson('/health',{fetcher});
  if(health.mode!=='READ_ONLY'||!health.databaseConnected||!health.schemaInitialized||
     health.stagingPipeline?.enabled!==false||health.stagingPipeline?.emailEnabled!==false||
     health.cleanSlate?.readyForProduction!==false||
     health.stagingPipeline?.pricePolicy!=='GOOGLE_LATEST_1000_MODEL_V1')
   throw Error('SHADOW_SAFETY_OR_CONFIGURATION');
  result.checks.shadow='PASS';
  const feed=await getJson('/v2/model/snapshot',{fetcher});
  if(feed.epoch!=='2026-10-19'||!Array.isArray(feed.active_portfolio))
   throw Error('SHADOW_FEED_UNAVAILABLE');
  const held=[...new Set(feed.active_portfolio.map(p=>p.ticker))];
  if(held.length>10||held.some(t=>typeof t!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(t)))
   throw Error('SHADOW_SYMBOLS_UNVERIFIED');
  result.heldCount=held.length;result.snapshotDate=feed.snapshot_date;
  if(!session.isTradingDay){result.status='MARKET_CLOSED';return result}
  const tickers=[...new Set([...held,'SPY','QQQ','SMH','XLK','XLE'])];
  const daily=await provider.getDailyMany({tickers,date:et.date});
  result.checks.daily=daily.length===tickers.length?'PASS':'INCOMPLETE';
  let minutesOk=true;
  for(const ticker of held){
   const evidence=await provider.getMinuteHistory({ticker,fromDate:prior,throughDate:prior});
   if(!coverage(evidence.bars,prior)){minutesOk=false;break}
  }
  result.checks.minutes=minutesOk?'PASS':'GOOGLE_MINUTE_COVERAGE_GAP';
  if(et.minute>=590&&et.minute<960){
   const quote=await getJson('/v2/google-quotes/probe',{fetcher});
   result.checks.opening=quote.status==='GOOGLE_MODEL_QUOTES_OBSERVED'&&
    quote.openingCoverage==='PASS'?'PASS':quote.reason||'GOOGLE_OPEN_NOT_VERIFIED';
  }
  const core=result.checks.shadow==='PASS'&&result.checks.daily==='PASS'&&result.checks.minutes==='PASS';
  result.status=!core?'BLOCKED':
   et.minute>=960?'AFTER_HOURS_HISTORY_ONLY':
   et.minute<590?'PREOPEN_GOOGLE_READY_OPENING_PENDING':
   result.checks.opening==='PASS'?'READ_ONLY_PREFLIGHT_PASS':'BLOCKED';
  return result;
 }catch(e){
  const known=new Set(['SHADOW_SAFETY_OR_CONFIGURATION','SHADOW_FEED_UNAVAILABLE',
   'SHADOW_SYMBOLS_UNVERIFIED','SHADOW_HTTP_UNAVAILABLE',
   'GOOGLE_CHART_ACCESS_RESTRICTED','GOOGLE_CHART_DAILY_HISTORY_INCOMPLETE',
   'GOOGLE_CHART_SERIES_MISSING','GOOGLE_CHART_CANDLE_INVALID']);
  result.reason=known.has(e?.message)?e.message:'GOOGLE_PREFLIGHT_SOURCE_UNAVAILABLE';
  return result;
 }
}
if(require.main===module)preflight().then(r=>{
 console.log(JSON.stringify(r));
 if(!['READ_ONLY_PREFLIGHT_PASS','PREOPEN_GOOGLE_READY_OPENING_PENDING','MARKET_CLOSED',
  'AFTER_HOURS_HISTORY_ONLY'].includes(r.status))process.exitCode=1;
}).catch(()=>{console.error(JSON.stringify({status:'BLOCKED',reason:'PREFLIGHT_UNAVAILABLE'}));process.exitCode=1});
module.exports={preflight,getJson,coverage};
