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
  // An opening STOP LOSS is NOT an intraday low: only the verified 09:30
  // regular-session bar OPEN may trigger, and only for a lot held at that open.
  const heldAtOpening=position.entryDate<b.date&&Date.parse(position.entryTime)<Date.parse(b.start);
  const stop=heldAtOpening&&localET(b.start).minute===570&&b.open<=position.entryPrice*.95;
  const target=b.high+1e-9>=position.entryPrice*1.10;
  if(stop||target)return {ticker:position.ticker,entryDate:position.entryDate,reason:stop?'STOP LOSS':'TARGET',
   triggerAt:stop?b.start:b.end,sourceId:b.sourceId,triggerPriceKind:stop?'MINUTE_BAR_OPEN':'MINUTE_BAR_HIGH',
   ambiguousSameBar:stop&&target,checkedThrough:through};
 }
 return null;
}
// Preserve exact known failure codes; classify only unknown provider/DB exceptions by
// the stage that raised them. No payload, URL, symbol or private context is logged.
async function preopenStage(work,unknownReason){
 try{return await work()}
 catch(error){
  const reason=error instanceof Error?error.message:'';
  const known=new Set(['NEWS_COVERAGE_FAILED','TARGET_MINUTE_COVERAGE_GAP',
   'TARGET_WINDOW_OUTSIDE_AVAILABLE_MINUTE_HISTORY','TARGET_POSITION_OR_TIME_EVIDENCE_MISSING',
   'HOLDING_OUTSIDE_RESEARCH_UNIVERSE','HOLDING_SCAN_START_MISSING',
   'PREOPEN_TRIGGER_PROVIDER_FAILED','RESEARCH_SYMBOL_MISMATCH',
   'COMPANY_IDENTITY_UNVERIFIED','RESEARCH_SECTOR_MAPPING_INCOMPLETE',
   'Missing completed-session history']);
  if(known.has(reason)||/^RESEARCH_OHLCV_HTTP_\d{3}$/.test(reason))throw error;
  throw Error(unknownReason);
 }
}
async function preparePreopen({date,url,clock=()=>new Date(),env,fetchFn=fetch,getPrior=readLastCleanState}){
 const started=clock().toISOString(),et=localET(started);
 if(et.date!==date||et.minute>=570||!sessionEvidence(date).isTradingDay)throw Error('OUTSIDE_PREOPEN_WINDOW');
 const previous=await preopenStage(()=>getPrior({url}),'PREOPEN_LEDGER_READ_FAILED'),sourceSession=previousSession(date),s=sessionEvidence(sourceSession),hm=s.closeEt.split(':').map(Number),through=etTime(sourceSession,hm[0]*60+hm[1]);
 if(previous&&previous.date>=date)throw Error('PREOPEN_ALREADY_REVIEWED');
 const runtime=createResearchRuntime({universeCsv:env.VIXALE_V2_RESEARCH_UNIVERSE,sectorByTicker:JSON.parse(env.VIXALE_V2_RESEARCH_SECTORS_JSON),fetchFn,clock,completedSessionOnly:true});
 const providers=await preopenStage(()=>runtime({date}),'PREOPEN_RESEARCH_COLLECTION_FAILED');
 const batch=await preopenStage(()=>providers.researchProvider.getBatch({date,runAt:clock().toISOString(),session:sessionEvidence(date)}),'PREOPEN_RESEARCH_CERTIFICATION_FAILED'),exits=[];
 for(const position of previous?.active||[]){
  const r=batch.items.find(x=>x.ticker===position.ticker);if(!r)throw Error('HOLDING_OUTSIDE_RESEARCH_UNIVERSE');
  const from=position.lastTargetCheckedAt||position.entryTime;
  if(!Number.isFinite(Date.parse(from)))throw Error('HOLDING_SCAN_START_MISSING');
  // Yahoo's interval=1m chart may return the first requested candle with invalid OHLCV.
  // Fetch one extra earlier minute, but still validate/scan ONLY from the unchanged
  // certified watermark. Historical targets/stops and source gates remain identical.
  const requestStart=Date.parse(from)-60000;
  const u='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(position.ticker)+'?interval=1m&period1='+Math.floor(requestStart/1000)+'&period2='+Math.ceil(Date.parse(through)/1000);
  const trigger=await preopenStage(async()=>{
   const res=await fetchFn(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('PREOPEN_TRIGGER_PROVIDER_FAILED');
   return exitEvidence(await res.json(),{position,through});
  },'PREOPEN_CARRIED_MINUTE_EVIDENCE_FAILED');
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
