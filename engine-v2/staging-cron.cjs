'use strict';
// One invocation, no web server and no legacy portfolio import.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
async function runScheduled({env=process.env,clock=()=>new Date(),createWorker}={}){
 const done=(status,reason,exitCode)=>({status,reason,exitCode,productionCutover:false});
 try{
  if(env.VIXALE_V2_SHADOW_MODE!=='READ_ONLY')return done('BLOCKED','SHADOW_MODE_REQUIRED',1);
  const url=env.VIXALE_V2_SHADOW_DATABASE_URL;
  if(!/^vixale_engine_v2_shadow_\d{8}$/.test(new URL(url).pathname.slice(1)))
   return done('BLOCKED','SHADOW_DATABASE_REQUIRED',1);
  const et=localET(clock().toISOString());
  const session=sessionEvidence(et.date);
  if(!session.isTradingDay)return done('SKIPPED','NYSE_CLOSED',0);
  // Both UTC hours are scheduled; only the actual 10am ET hour proceeds.
  // New decisions remain bounded to 10:00–10:05 by the pipeline itself.
  if(et.minute<600||et.minute>620)return done('SKIPPED','OUTSIDE_STAGING_RETRY_WINDOW',0);
  const worker=(createWorker||require('./staging-worker.cjs').createStagingWorker)({env,url,clock});
  const config=worker.status();
  if(!config.enabled||config.missing.length)return done('BLOCKED','STAGING_CONFIGURATION_INCOMPLETE',1);
  const result=await worker.tick();
  const success=['DELIVERED','ACCEPTED_NOT_DELIVERED','STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED','BUSY'];
  const failure=['BLOCKED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED'];
  const status=[...success,...failure].includes(result.status)?result.status:'BLOCKED';
  return done(status,success.includes(status)?null:'STAGING_RUN_REQUIRES_ATTENTION',success.includes(status)?0:1);
 }catch{
  // Provider errors can contain private data. Never print error objects or env.
  return done('BLOCKED','STAGING_RUN_FAILED',1);
 }
}
if(require.main===module)runScheduled().then(result=>{
 console.log(JSON.stringify(result));process.exitCode=result.exitCode;
});
module.exports={runScheduled};
