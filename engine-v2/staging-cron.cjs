'use strict';
// One invocation, no web server and no legacy portfolio import.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
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
  const preopen=env.VIXALE_V2_STAGING_PRICE_POLICY==='DELAYED_0940_MODEL_V1'&&et.minute<570;
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
   'STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE','STAGING_VERIFICATION_INCOMPLETE']);
  const reason=success.includes(status)?null:
   status==='BLOCKED'&&safeReasons.has(result.reason)?result.reason:'STAGING_RUN_REQUIRES_ATTENTION';
  return done(status,reason,success.includes(status)?0:1);
 }catch{
  // No raw exception text: provider failures may contain URLs, keys or account data.
  const reasons={SHADOW_IDENTITY:'SHADOW_DATABASE_REQUIRED',NYSE_SESSION:'NYSE_SESSION_UNAVAILABLE',
   WORKER_INITIALIZATION:'STAGING_WORKER_INITIALIZATION_FAILED',
   WORKER_CONFIGURATION:'STAGING_WORKER_CONFIGURATION_FAILED',
   PREOPEN_PREPARATION:'PREOPEN_PREPARATION_FAILED',MORNING_REVIEW:'MORNING_REVIEW_FAILED'};
  return done('BLOCKED',reasons[phase]||'STAGING_RUN_FAILED',1);
 }
}
if(require.main===module)runScheduled().then(result=>{
 console.log(JSON.stringify(result));process.exitCode=result.exitCode;
});
module.exports={runScheduled};
