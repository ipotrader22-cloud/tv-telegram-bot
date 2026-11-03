'use strict';
// One invocation, no web server and no legacy portfolio import.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
// Only literal, public-safe categories leave the pre-open exception boundary.
// Unknown/raw provider errors remain hidden; this never changes success or retry policy.
function safePreopenFailure(error) {
 const message=error instanceof Error?error.message:null;
 if(typeof message!=='string')return 'PREOPEN_PREPARATION_FAILED';
 if(/^RESEARCH_OHLCV_HTTP_\d{3}$/.test(message))return 'STAGING_RESEARCH_SOURCE_UNAVAILABLE';
 if(['RESEARCH_SYMBOL_MISMATCH','COMPANY_IDENTITY_UNVERIFIED','RESEARCH_SECTOR_MAPPING_INCOMPLETE'].includes(message))
  return 'STAGING_RESEARCH_EVIDENCE_INVALID';
 if(message==='PREOPEN_TRIGGER_PROVIDER_FAILED'||/^YAHOO_MINUTE_DATA_HTTP_\d{3}$/.test(message))
  return 'STAGING_MINUTE_SOURCE_UNAVAILABLE';
 if(message==='BENCHMARK_OR_STOCK_SESSION_INCOMPLETE')return 'STAGING_MODEL_EVIDENCE_INCOMPLETE';
 if(['PREOPEN_IDENTITY_MISMATCH','PREOPEN_HASH_MISMATCH','PREOPEN_SESSION_INCOMPLETE',
     'PREOPEN_TIME_INVALID','PREOPEN_ALREADY_REVIEWED'].includes(message))
  return 'STAGING_PREOPEN_STATE_CONFLICT';
 if(message==='OUTSIDE_PREOPEN_WINDOW')return 'STAGING_DECISION_WINDOW_EXPIRED';
 return 'PREOPEN_PREPARATION_FAILED';
}

async function runScheduled({env=process.env,clock=()=>new Date(),createWorker}={}){
 const done=(status,reason,exitCode)=>({status,reason,exitCode,productionCutover:false});
 let phase='SHADOW_IDENTITY';
 try{
  if(env.VIXALE_V2_SHADOW_MODE!=='READ_ONLY')return done('BLOCKED','SHADOW_MODE_REQUIRED',1);
  const url=env.VIXALE_V2_SHADOW_DATABASE_URL;
  let parsed;try{parsed=new URL(url)}catch{return done('BLOCKED','SHADOW_DATABASE_REQUIRED',1)}
  if(!/^vixale_engine_v2_shadow_\d{8}$/.test(parsed.pathname.slice(1)))
   return done('BLOCKED','SHADOW_DATABASE_REQUIRED',1);
  phase='NYSE_SESSION';
  const et=localET(clock().toISOString());
  const session=sessionEvidence(et.date);
  if(!session.isTradingDay)return done('SKIPPED','NYSE_CLOSED',0);
  // Both UTC hours are scheduled; only the actual 10am ET hour proceeds.
  // New decisions remain bounded to 10:00–10:05 by the pipeline itself.
  const preopen=['DELAYED_0940_MODEL_V1','GOOGLE_LATEST_1000_MODEL_V1'].includes(env.VIXALE_V2_STAGING_PRICE_POLICY)&&et.minute<570;
  if(!preopen&&(et.minute<600||et.minute>620))return done('SKIPPED','OUTSIDE_STAGING_RETRY_WINDOW',0);
  phase='WORKER_INITIALIZATION';
  const worker=(createWorker||require('./staging-worker.cjs').createStagingWorker)({env,url,clock});
  phase='WORKER_CONFIGURATION';
  const config=worker.status();
  // Emit only fixed capability names, never environment values or provider
  // exceptions. This makes unattended staging failures diagnosable.
  const allowed=new Set(['STAGING_SERVICE_ACCOUNT','INDEPENDENT_RESEARCH_UNIVERSE',
   'RESEARCH_SECTOR_MAP','STAGING_EMAIL_RECIPIENT','STAGING_RESEND_CREDENTIAL',
   'INVALID_STAGING_CONFIGURATION']);
  const missing=Array.isArray(config.missing)?config.missing.filter(x=>allowed.has(x)):[];
  if(!config.enabled||config.missing?.length)return {
   ...done('BLOCKED','STAGING_CONFIGURATION_INCOMPLETE',1),
   missingCapabilities:!config.enabled?['STAGING_PIPELINE_ENABLED']:missing.length?missing:['UNCLASSIFIED_CONFIGURATION']
  };
  phase=preopen?'PREOPEN_PREPARATION':'MORNING_REVIEW';
  const result=preopen?await worker.prepare():await worker.tick();
  const success=['PREOPEN_PREPARED','DELIVERED','ACCEPTED_NOT_DELIVERED','STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED','BUSY'];
  const failure=['BLOCKED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED'];
  const status=[...success,...failure].includes(result.status)?result.status:'BLOCKED';
  // Preserve only fixed, public-safe failure categories; never forward provider text.
  const safeReasons=new Set(['STAGING_CONFIGURATION_INCOMPLETE',
   'STAGING_WORKBOOK_METADATA_UNVERIFIED','PREOPEN_PREPARATION_MISSING',
   'STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE','STAGING_VERIFICATION_INCOMPLETE',
   'STAGING_LEDGER_EXCEPTION','STAGING_RESEARCH_EXCEPTION','STAGING_MODEL_EXCEPTION',
   'STAGING_SHEET_EXCEPTION','STAGING_WEBSITE_EXCEPTION','STAGING_EMAIL_EXCEPTION',
   'STAGING_SHEET_VERIFICATION_FAILED','STAGING_WEBSITE_PARITY_FAILED','STAGING_MODEL_CYCLE_FAILED',
   'STAGING_FIXED_0940_BAR_MISSING','STAGING_FIXED_0940_BAR_INVALID',
   'STAGING_MINUTE_SOURCE_UNAVAILABLE','STAGING_MINUTE_SOURCE_INVALID',
   'STAGING_CURRENT_OPENING_UNAVAILABLE','STAGING_CURRENT_OPENING_INVALID',
   'STAGING_PREOPEN_STATE_CONFLICT','STAGING_MODEL_EVIDENCE_INCOMPLETE',
   'STAGING_DECISION_WINDOW_EXPIRED','STAGING_GOOGLE_QUOTE_INVALID']);
  const reason=success.includes(status)?null:
   status==='BLOCKED'&&safeReasons.has(result.reason)?result.reason:'STAGING_RUN_REQUIRES_ATTENTION';
  return done(status,reason,success.includes(status)?0:1);
 }catch(error){
  // No raw exception text: provider failures may contain URLs, keys or account data.
  const reasons={SHADOW_IDENTITY:'SHADOW_DATABASE_REQUIRED',NYSE_SESSION:'NYSE_SESSION_UNAVAILABLE',
   WORKER_INITIALIZATION:'STAGING_WORKER_INITIALIZATION_FAILED',
   WORKER_CONFIGURATION:'STAGING_WORKER_CONFIGURATION_FAILED',
   PREOPEN_PREPARATION:'PREOPEN_PREPARATION_FAILED',MORNING_REVIEW:'MORNING_REVIEW_FAILED'};
  return done('BLOCKED',phase==='PREOPEN_PREPARATION'?safePreopenFailure(error):reasons[phase]||'STAGING_RUN_FAILED',1);
 }
}
if(require.main===module)runScheduled().then(result=>{
 console.log(JSON.stringify(result));process.exitCode=result.exitCode;
});
module.exports={runScheduled,safePreopenFailure};
