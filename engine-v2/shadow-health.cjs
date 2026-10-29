'use strict';
// Separate shadow-only service: no trading writes, no portfolio APIs.
const http=require('node:http');
const {Client}=require('pg');
const {initialize}=require('./init-shadow.cjs');
const {loadSnapshot}=require('./import-source.cjs');
const {auditAll}=require('./replay-all.cjs');
const {auditValuation}=require('./valuation-integrity.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {pollRenderQuoteStatus}=require('./render-quote-observer.cjs');
const {checkMinuteFeed}=require('./live-quote-probe.cjs');
const {readShadowPublicFeed}=require('./shadow-public-feed.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {compareStored}=require('./shadow-compare.cjs');
const {getLiveSnapshot,compareImported}=require('./live-sheet-check.cjs');
const {saveSummary}=require('./compare-history.cjs');
const {comparisonStats}=require('./comparison-stats.cjs');
const mode=process.env.VIXALE_V2_SHADOW_MODE;
if(mode!=='READ_ONLY')throw Error('Shadow-only mode required');
const url=process.env.VIXALE_V2_SHADOW_DATABASE_URL;
if(!url)throw Error('Internal shadow DB connection missing');
const name=new URL(url).pathname.slice(1);
if(!/^vixale_engine_v2_shadow_\d{8}$/.test(name))throw Error('Unexpected database');
const port=Number(process.env.PORT||10000);
const {createStagingWorker}=require('./staging-worker.cjs');
const stagingWorker=createStagingWorker({url});
let stagingAccess={workbook:'PENDING',writesPerformed:false};
require('./staging-preflight.cjs').stagingPreflight().then(result=>{stagingAccess=result})
 .catch(()=>{stagingAccess={workbook:'PREFLIGHT_FAILED',writesPerformed:false}});
const readPreview=async()=>await stagingWorker.store.publishedFeed()||await readShadowPublicFeed({url});
async function inspect(){
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});
 await client.connect();
 try {
   await client.query('BEGIN READ ONLY');
   const result=await client.query("SELECT current_database() AS db, to_regnamespace('vixale_v2') IS NOT NULL AS schema_present");
   await client.query('COMMIT');
   if(result.rows[0].db!==name)throw Error('Database mismatch');
   return {connected:true,schemaPresent:result.rows[0].schema_present};
 }finally{await client.end()}
}
let last={connected:false,schemaPresent:false};
let comparison={status:'PENDING'};
let liveStatus={status:'NOT_CONFIGURED'};
let historyStats={checks:0,changed_checks:0};
let renderQuotes={status:'NOT_CONFIGURED',tradeEvidenceVerified:false};
let lastProbe={status:'NOT_CHECKED',tradeEvidenceVerified:false,modelEntryEligible:false};
let probeTime=0,probeFlight=null;
function marketProbe(){
 if(Date.now()-probeTime<60000)return Promise.resolve(lastProbe);
 if(probeFlight)return probeFlight;
 probeFlight=checkMinuteFeed().then(result=>{lastProbe=result;probeTime=Date.now();return result})
  .finally(()=>{probeFlight=null});
 return probeFlight;
}
let googleProbeCache=null,googleProbeAt=0,googleProbeFlight=null;
async function googleProbe(){
 if(googleProbeCache&&Date.now()-googleProbeAt<60000)return googleProbeCache;
 if(googleProbeFlight)return googleProbeFlight;
 googleProbeFlight=(async()=>{
  const {createSheetsClient}=require('./staging-sheets-publisher.cjs');
  const {createGoogleQuoteProvider}=require('./google-quote-provider.cjs');
  try{
   const quotes=await createGoogleQuoteProvider({api:createSheetsClient(process.env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON)}).getQuotes({
    date:require('./market-data-adapter.cjs').localET(new Date().toISOString()).date,
    tickers:['NVDA','AMD','AVGO','MU','AMAT','MSFT','AAPL','ORCL','XOM','CVX']});
   return {status:'GOOGLE_MODEL_QUOTES_OBSERVED',quotes,readOnly:true,modelEntryEligible:false};
  }catch(e){
   const allowed=new Set(['GOOGLE_QUOTE_STALE_OR_INVALID','GOOGLE_QUOTE_TIMESTAMP_INVALID','GOOGLE_QUOTE_IDENTITY_INVALID','GOOGLE_QUOTE_MISSING','GOOGLE_QUOTE_SHEET_INVALID','GOOGLE_QUOTE_FORMULA_INVALID']);
   return {status:'BLOCKED',reason:allowed.has(e.message)?e.message:'GOOGLE_QUOTE_SOURCE_UNAVAILABLE',readOnly:true,modelEntryEligible:false};
  }
 })().then(r=>{googleProbeCache=r;googleProbeAt=Date.now();return r;}).finally(()=>{googleProbeFlight=null;});
 return googleProbeFlight;
}
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&path==='/v2/swing-trading'){
  readPreview().then(snapshot=>{
   const html=renderShadowSwing(snapshot);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'});
   res.end(html);
  }).catch(()=>{
   res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'});
   res.end('Engine 2 shadow preview unavailable: ledger proof missing.');
  });
  return;
 }

 if(req.method==='GET'&&path==='/v2/model/snapshot'){
  readPreview().then(payload=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload))})
   .catch(()=>{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'BLOCKED',reason:'SHADOW_LEDGER_READ_UNAVAILABLE',published:false}))});
  return;
 }
 if(req.method==='GET'&&path==='/v2/google-quotes/probe'){
  googleProbe().then(result=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));});
  return;
 }
 if(req.method==='GET'&&path==='/v2/market-data/probe'){
  marketProbe().then(result=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({mode:'READ_ONLY',provider:'YAHOO_CHART',...result}))})
   .catch(()=>{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'BLOCKED',reason:'MARKET_PROBE_FAILED',tradeEvidenceVerified:false,modelEntryEligible:false}))});
  return;
 }
 if(path!=='/health'){res.writeHead(404);res.end();return}
 res.writeHead(last.connected?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({mode:'READ_ONLY',databaseConnected:last.connected,schemaInitialized:last.schemaPresent,comparisonStatus:comparison.status,sourceDate:comparison.asOf||null,sourceType:'IMPORTED_SNAPSHOT_NOT_LIVE',stagingAccess,stagingPipeline:stagingWorker.status(),cleanSlate:{epoch:EPOCH,mode:'SHADOW_ONLY',autonomousPublisherEnabled:false,sessionCalendarReady:sessionEvidence(EPOCH).isTradingDay,marketDataProviderReady:false,researchProviderReady:false,readyForProduction:false,renderQuoteObservationStatus:renderQuotes.status,renderQuoteObservationCount:renderQuotes.symbols?.length||0,renderQuoteTradeEvidenceVerified:false},valuationStatus:comparison.valuation?.status||'UNKNOWN',valuationErrors:comparison.valuation?.errors?.length||0,entryIntegrityStatus:comparison.entryIntegrity?.status||'UNKNOWN',historicalCertificationStatus:comparison.historical?.status||'UNKNOWN',historicalCertifiedMarks:comparison.historical?.certified||0,liveSheetStatus:liveStatus.status,liveSheetDate:liveStatus.sourceDate||null,historyChecks:historyStats.checks,historyChangedChecks:historyStats.changed_checks,historyLatestCheck:historyStats.latest_check||null}));
});
const refresh=async()=>{
 if(process.env.VIXALE_V2_RENDER_QUOTE_STATUS_URL){
  renderQuotes=await pollRenderQuoteStatus({url:process.env.VIXALE_V2_RENDER_QUOTE_STATUS_URL,authorization:process.env.VIXALE_V2_RENDER_QUOTE_STATUS_AUTHORIZATION});
 }
 try{last=await inspect();if(last.connected&&last.schemaPresent){comparison=await compareStored({url});console.log('Shadow stored comparison:',JSON.stringify({status:comparison.status,asOf:comparison.asOf,realized:comparison.realized?.status,frozen:comparison.frozen?.status,unverifiedByDate:comparison.frozen?.unverifiedByDate||[],formulaErrors:comparison.frozen?.errors||[],valuationStatus:comparison.valuation?.status,valuationErrors:comparison.valuation?.errors||[],entryIntegrityStatus:comparison.entryIntegrity?.status,historicalCertificationStatus:comparison.historical?.status,historicalCertifiedMarks:comparison.historical?.certified||0}));if(process.env.VIXALE_V2_GOOGLE_SERVICE_ACCOUNT_JSON){
  try{
    const live=await getLiveSnapshot({credentials:process.env.VIXALE_V2_GOOGLE_SERVICE_ACCOUNT_JSON});
    const {Client:PgClient}=require('pg');const conn=new PgClient({connectionString:url});await conn.connect();
    let imported;try{await conn.query('BEGIN READ ONLY');const q=await conn.query('SELECT payload FROM vixale_v2.source_snapshots ORDER BY received_at DESC LIMIT 1');await conn.query('COMMIT');if(!q.rows.length)throw Error('Historical import unavailable');imported=q.rows[0].payload}finally{await conn.end()}
    const parity=compareImported(live,imported);
    liveStatus={...parity,status:parity.parityStatus==='BLOCKED_VALUATION'?'BLOCKED':parity.parityStatus==='DRIFT'?'DRIFT':'PARTIAL',reason:parity.parityStatus==='DRIFT'?'SOURCE_DIFFERENCE':'FULL_PARITY_NOT_CERTIFIED'};
    await saveSummary(url,liveStatus);
    historyStats=await comparisonStats(url);
    console.log('Shadow LIVE Sheet comparison:',JSON.stringify({status:liveStatus.status,sourceDate:liveStatus.sourceDate,updated:liveStatus.updated,closedChanged:liveStatus.closedChanged,closedRemoved:liveStatus.closedRemoved,activeChanged:liveStatus.activeChanged,frozenChanged:liveStatus.frozenChanged}));
  }catch(e){liveStatus={status:'ERROR'};console.error('Shadow live Sheet read failed:',e.message)}
}}}catch(e){last={connected:false,schemaPresent:false};comparison={status:'ERROR'};console.error('Shadow database audit unavailable:',e.message)}};
(async()=>{
 try{
  if(process.env.VIXALE_V2_SHADOW_INIT==='YES'){
    const initialized=await initialize({url,allow:'YES'});
    console.log('Shadow schema initialized:',initialized.tables.length,'tables');
  }
 }catch(e){console.error('Shadow schema initialization FAILED:',e.message)}
 if(process.env.VIXALE_V2_SOURCE_IMPORT_JSON){
   const snapshot=JSON.parse(process.env.VIXALE_V2_SOURCE_IMPORT_JSON);
   const audit=auditAll(snapshot);
   const valuation=auditValuation(snapshot.active||[]);
   if(valuation.status!=='PASS'){
     console.error('Shadow import BLOCKED: invalid market quotes; preserving prior snapshot:',JSON.stringify({errors:valuation.errors}));
   }else if(audit.status!=='PASS'){
     console.error('Shadow import BLOCKED: realized accounting replay failed; preserving prior snapshot');
   }else{
     const imported=await loadSnapshot({url,payload:snapshot});
     console.log('Shadow historical import verified:',JSON.stringify({...imported,replayedDates:audit.dates}));
   }
 }
 await refresh();
 server.listen(port,'0.0.0.0',()=>{
  void require('./startup-readonly-audit.cjs').auditReadOnlySurface({port,googleProbe}).then(result=>console.log('Shadow startup read-only audit:',JSON.stringify(result)));
  void stagingWorker.tick();
  setInterval(()=>{void stagingWorker.tick()},60000).unref();
 });
})().catch(e=>{console.error('Shadow observer startup failed:',e.message);process.exitCode=1});
setInterval(refresh,60000).unref();
