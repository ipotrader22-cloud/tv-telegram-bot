'use strict';
// Pre-session / same-day read-only reliability gate. This script never writes
// the ledger, Sheet, broker, email, or customer-visible data.
const {createYahooMinuteProvider,openingFromBars}=require('./yahoo-minute-fallback.cjs');
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const ORIGIN='https://vixale-engine-v2-shadow-observer.onrender.com';
const safeProviderFailure=e=>{
 const m=e instanceof Error?e.message:'';
 if(m==='YAHOO_MINUTE_DATA_HTTP_429')return 'YAHOO_RATE_LIMITED';
 if(/^YAHOO_MINUTE_DATA_HTTP_5\\d\\d$/.test(m))return 'YAHOO_UPSTREAM_ERROR';
 if(m==='YAHOO_MINUTE_DATA_TIMEOUT')return 'YAHOO_TIMEOUT';
 if(m==='YAHOO_MINUTE_DATA_TRANSPORT')return 'YAHOO_TRANSPORT_FAILURE';
 if(m==='INVALID_YAHOO_CHART'||m.startsWith('YAHOO_MINUTE_'))return 'YAHOO_INVALID_OR_UNAVAILABLE';
 return 'YAHOO_UNCLASSIFIED_FAILURE';
};
async function getJson(path,{fetcher=fetch}={}){
 const response=await fetcher(ORIGIN+path,{method:'GET',redirect:'error',
  headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('SHADOW_HTTP_UNAVAILABLE');
 return response.json();
}
async function preflight({now=new Date(),fetcher=fetch,
 provider=createYahooMinuteProvider()}={}){
 const et=localET(now.toISOString()),session=sessionEvidence(et.date);
 const receipt={status:'BLOCKED',date:et.date,minuteET:et.minute,readOnly:true,
  financialWrites:false,productionCutover:false,
  checks:{health:'NOT_CHECKED',google:'NOT_CHECKED',renderYahoo:'NOT_CHECKED',
   heldOpeningSource:'NOT_CHECKED'}};
 try{
  const health=await getJson('/health',{fetcher});
  if(health.mode!=='READ_ONLY'||!health.databaseConnected||
     !health.schemaInitialized||health.stagingPipeline?.enabled!==false||
     health.stagingPipeline?.emailEnabled!==false||
     health.cleanSlate?.readyForProduction!==false||
     health.stagingPipeline?.pricePolicy!=='GOOGLE_LATEST_1000_MODEL_V1')
    throw Error('SHADOW_SAFETY_OR_CONFIGURATION');
  receipt.checks.health='PASS';
  const feed=await getJson('/v2/model/snapshot',{fetcher});
  if(feed.epoch!=='2026-10-19'||!Array.isArray(feed.active_portfolio))
   throw Error('SHADOW_FEED_UNAVAILABLE');
  const tickers=[...new Set(feed.active_portfolio.map(p=>p.ticker))];
  if(tickers.length>10||tickers.some(t=>typeof t!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(t)))
   throw Error('SHADOW_SYMBOLS_UNVERIFIED');
  receipt.heldCount=tickers.length;receipt.snapshotDate=feed.snapshot_date;
  if(!session.isTradingDay){receipt.status='MARKET_CLOSED';return receipt}
  if(et.minute<590){receipt.status='BEFORE_DELAYED_OPEN_RELEASE';return receipt}
  const yahoo=await getJson('/v2/market-data/probe',{fetcher});
  // This check executes from Render, not the GitHub runner.
  receipt.checks.renderYahoo=yahoo.openingBarObserved===true?'PASS':
   yahoo.sourceFailure||yahoo.reason||'OPENING_MISSING';
  if(et.minute>=960){receipt.status='AFTER_HOURS_GOOGLE_NOT_CHECKED'}
  else{
   const google=await getJson('/v2/google-quotes/probe',{fetcher});
   receipt.checks.google=google.status==='GOOGLE_MODEL_QUOTES_OBSERVED'?'PASS':
    google.reason||'GOOGLE_UNAVAILABLE';
  }
  const failures=[];
  for(const ticker of tickers){
   try{
    const {bars}=await provider.getBars({ticker,date:et.date,at:now.toISOString()});
    const opening=openingFromBars(bars,{ticker,date:et.date});
    if(opening.confirmed!==true)failures.push('NO_EXACT_0930_BAR');
   }catch(e){failures.push(safeProviderFailure(e))}
  }
  receipt.checks.heldOpeningSource=failures.length===0?'PASS':failures[0];
  const required=['health','renderYahoo','heldOpeningSource',
   ...(et.minute<960?['google']:[])];
  receipt.status=required.every(k=>receipt.checks[k]==='PASS')?
   'READ_ONLY_PREFLIGHT_PASS':'BLOCKED';
  return receipt;
 }catch(error){
  receipt.reason=['SHADOW_SAFETY_OR_CONFIGURATION','SHADOW_FEED_UNAVAILABLE',
   'SHADOW_SYMBOLS_UNVERIFIED','SHADOW_HTTP_UNAVAILABLE'].includes(error.message)?
    error.message:'PREFLIGHT_READ_UNAVAILABLE';
  return receipt;
 }
}
if(require.main===module){
 preflight().then(r=>{console.log(JSON.stringify(r));if(![
  'READ_ONLY_PREFLIGHT_PASS','MARKET_CLOSED','BEFORE_DELAYED_OPEN_RELEASE'
 ].includes(r.status))process.exitCode=1}).catch(()=>{
  console.error(JSON.stringify({status:'BLOCKED',reason:'PREFLIGHT_UNAVAILABLE',readOnly:true}));
  process.exitCode=1;
 });
}
module.exports={preflight,safeProviderFailure,getJson};
