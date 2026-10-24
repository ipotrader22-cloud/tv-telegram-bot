'use strict';
const {POLICY,hash,priorIdentity,etTime,validatePrepared,fixedQuote}=require('./delayed-model-policy.cjs');
const {localET}=require('./market-data-adapter.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {readLastCleanState}=require('./clean-ledger.cjs');
const {createResearchRuntime}=require('./staging-research-runtime.cjs');
const {createYahooMinuteProvider,completedBars}=require('./yahoo-minute-fallback.cjs');
const {verifyTargetWindow}=require('./target-window-provider.cjs');
function exitEvidence(raw,{position,through}){
 const coverage=verifyTargetWindow(raw,{position,runAt:through});
 const dates=new Set();
 for(let t=Date.parse(coverage.coverageFrom);t<=Date.parse(through);t+=86400000)dates.add(localET(new Date(t).toISOString()).date);
 dates.add(localET(through).date);
 const bars=[...dates].flatMap(date=>completedBars(raw,{ticker:position.ticker,date,asOf:through})).filter(b=>Date.parse(b.start)>=Date.parse(coverage.coverageFrom)).sort((a,b)=>a.start.localeCompare(b.start));
 for(const b of bars){
  const stop=b.low<=position.entryPrice*.95,target=b.high+1e-9>=position.entryPrice*1.10;
  if(stop||target)return {ticker:position.ticker,entryDate:position.entryDate,reason:stop?'STOP LOSS':'TARGET',triggerAt:b.end,sourceId:b.sourceId,ambiguousSameBar:stop&&target,checkedThrough:through};
 }
 return null;
}
async function preparePreopen({date,url,clock=()=>new Date(),env,fetchFn=fetch,getPrior=readLastCleanState}){
 const started=clock().toISOString(),et=localET(started);
 if(et.date!==date||et.minute>=570||!sessionEvidence(date).isTradingDay)throw Error('OUTSIDE_PREOPEN_WINDOW');
 const previous=await getPrior({url}),sourceSession=previousSession(date),s=sessionEvidence(sourceSession),hm=s.closeEt.split(':').map(Number),through=etTime(sourceSession,hm[0]*60+hm[1]);
 if(previous&&previous.date>=date)throw Error('PREOPEN_ALREADY_REVIEWED');
 const runtime=createResearchRuntime({universeCsv:env.VIXALE_V2_RESEARCH_UNIVERSE,sectorByTicker:JSON.parse(env.VIXALE_V2_RESEARCH_SECTORS_JSON),fetchFn,clock});
 const providers=await runtime({date}),batch=await providers.researchProvider.getBatch({date,runAt:clock().toISOString(),session:sessionEvidence(date)}),exits=[];
 for(const position of previous?.active||[]){
  const r=batch.items.find(x=>x.ticker===position.ticker);if(!r)throw Error('HOLDING_OUTSIDE_RESEARCH_UNIVERSE');
  const from=position.lastTargetCheckedAt||position.entryTime;
  if(!Number.isFinite(Date.parse(from)))throw Error('HOLDING_SCAN_START_MISSING');
  const u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(position.ticker)+'?interval=1m&period1='+Math.floor(Date.parse(from)/1000)+'&period2='+Math.ceil(Date.parse(through)/1000);
  const res=await fetchFn(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('PREOPEN_TRIGGER_PROVIDER_FAILED');
  const trigger=exitEvidence(await res.json(),{position,through});
  if(trigger)exits.push(trigger);
  else if(r.score<70)exits.push({ticker:position.ticker,entryDate:position.entryDate,reason:'DROPPED FROM ACTIVE PORTFOLIO',sourceId:r.ohlcvSourceId,triggerAt:through});
 }
 if(batch.sourceEvidence.artifact.data.some(x=>x.metrics.lastCompleteDate!==sourceSession))throw Error('BENCHMARK_OR_STOCK_SESSION_INCOMPLETE');
 const p={policy:POLICY,date,sourceSession,preparedAt:clock().toISOString(),priorHash:hash(priorIdentity(previous)),batch,exits,checkedThrough:through};
 p.fingerprint=hash(p);validatePrepared(p,{date,previous,now:p.preparedAt});return p;
}
function createFixedQuoteProvider({fetchFn=fetch,clock=()=>new Date()}={}){
 const source=createYahooMinuteProvider({fetchFn});
 return {async getQuotes({date,tickers}){return Promise.all(tickers.map(async ticker=>{
  const at=clock().toISOString(),{bars}=await source.getBars({ticker,date,at});
  return fixedQuote(bars,{ticker,date,fetchedAt:clock().toISOString()});
 }))}};
}
module.exports={preparePreopen,createFixedQuoteProvider,exitEvidence};
