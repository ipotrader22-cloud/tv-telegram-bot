'use strict';
// One-time read-only Google-only full preopen rehearsal with real source data,
// but synthetic LOT inputs that are NEVER written to DB, Sheet, website, email
// or broker. Do not use resulting exits/rankings as portfolio decisions.
const {preparePreopen}=require('./preopen-preparation.cjs');
const {validatePrepared,etTime}=require('./delayed-model-policy.cjs');
const date='2026-11-04',asOf=new Date(etTime(date,445));
const universe=['AMD','NVDA','AVGO','MU','AMAT','MSFT','AAPL','ORCL','XOM','CVX'];
const sectors=Object.fromEntries(universe.map(x=>[x,['XOM','CVX'].includes(x)?'XLE':['AMD','NVDA','AVGO','MU','AMAT'].includes(x)?'SMH':'XLK']));
const prior={epoch:'2026-10-19',date:'2026-11-02',closed:[],history:[],
 active:['XOM','CVX'].map(ticker=>({ticker,entryDate:'2026-11-02',
  entryTime:etTime('2026-11-02',600),lastTargetCheckedAt:etTime('2026-11-02',600),
  entryPrice:100,exchange:'NYSE'}))};
const allowed=new Set(['PREOPEN_RESEARCH_COLLECTION_FAILED','PREOPEN_RESEARCH_CERTIFICATION_FAILED',
 'PREOPEN_CARRIED_MINUTE_EVIDENCE_FAILED','GOOGLE_MINUTE_COVERAGE_GAP',
 'GOOGLE_HISTORICAL_OPEN_MISSING','GOOGLE_CHART_DAILY_HISTORY_INCOMPLETE',
 'NEWS_COVERAGE_FAILED','BENCHMARK_OR_STOCK_SESSION_INCOMPLETE','PREOPEN_TIME_INVALID',
 'RESEARCH_COMPLETED_AFTER_DECISION_WINDOW','GOOGLE_CHART_ACCESS_RESTRICTED',
 'GOOGLE_CHART_INTERVAL_INVALID','PREOPEN_TRIGGER_PROVIDER_FAILED']);
async function run({fetchFn=fetch}={}){
 let yahooAttempts=0,googleRequests=0,newsRequests=0;
 const wrapped=async (url,opts)=>{
  const host=new URL(url).hostname;
  if(host.includes('yahoo')){yahooAttempts++;throw Error('YAHOO_NOT_ALLOWED')}
  if(host==='www.google.com')googleRequests++;
  if(host==='news.google.com')newsRequests++;
  return fetchFn(url,opts);
 };
 try{
  const p=await preparePreopen({date,url:'postgresql://localhost/vixale_engine_v2_shadow_20990101',
   env:{VIXALE_V2_STAGING_PRICE_POLICY:'GOOGLE_LATEST_1000_MODEL_V1',
    VIXALE_V2_RESEARCH_UNIVERSE:universe.join(','),
    VIXALE_V2_RESEARCH_SECTORS_JSON:JSON.stringify(sectors)},
   clock:()=>asOf,fetchFn:wrapped,getPrior:async()=>prior});
  validatePrepared(p,{date,previous:prior,now:asOf.toISOString()});
  const items=p.batch.items;
  return {status:items.length===10&&items.every(x=>Object.keys(x.factors).length===9)&&
   yahooAttempts===0?'PASS':'BLOCKED',
   source:'GOOGLE_FINANCE_CHART',sourceSession:p.sourceSession,reviewDate:p.date,
   researchCount:items.length,benchmarkCount:p.batch.benchmarks.length,
   allNineFactors:items.every(x=>Object.keys(x.factors).length===9),
   minDailyBars:Math.min(...items.map(x=>x.completedDailyBars)),
   scannedHeldLots:prior.active.length,syntheticExitCount:p.exits.length,
   googleRequests,newsRequests,yahooAttempts,
   writesPerformed:false,emailSent:false,brokerOrders:false,syntheticPriorOnly:true};
 }catch(e){return {status:'BLOCKED',stage:allowed.has(e?.message)?e.message:'PREOPEN_REHEARSAL_SOURCE_UNVERIFIED',
   googleRequests,newsRequests,yahooAttempts,
   writesPerformed:false,emailSent:false,brokerOrders:false,syntheticPriorOnly:true}}
}
if(require.main===module)run().then(r=>{console.log('ENGINE2_REAL_GOOGLE_PREOPEN_REHEARSAL',JSON.stringify(r));if(r.status!=='PASS')process.exitCode=1})
 .catch(()=>{console.log('ENGINE2_REAL_GOOGLE_PREOPEN_REHEARSAL',JSON.stringify({status:'BLOCKED',reason:'REHEARSAL_CRASHED'}));process.exitCode=1});
module.exports={run};