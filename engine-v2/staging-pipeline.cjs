'use strict';
const {runCleanCycle}=require('./clean-cycle-runner.cjs');
const {readCleanRun,readLastCleanState}=require('./clean-ledger.cjs');
const {buildStagingArtifact,assertArtifact}=require('./staging-artifact.cjs');
const {writePrivateStaging}=require('./staging-sheets-publisher.cjs');
const {directReadback}=require('./direct-publication-readback.cjs');
const {prepareReviewEmail}=require('./resend-review-outbox.cjs');
const {sendViaResend,readResendDelivery}=require('./resend-client.cjs');
const {validateMorningTrigger}=require('./nyse-morning-clock.cjs');
const {localET}=require('./market-data-adapter.cjs');
const SHADOW_ORIGIN='https://vixale-engine-v2-shadow-observer.onrender.com';
async function runStagingPipeline({store,url,api,date,clock=()=>new Date(),prepareProviders,
 readRun=readCleanRun,readState=readLastCleanState,runCycle=runCleanCycle,
 publish=writePrivateStaging,readback=directReadback,send=sendViaResend,delivery=readResendDelivery,
 fetcher=fetch,recipient,allowedRecipient,emailEnabled=false,apiKey,enabled=false}={}){
 const blocked=reason=>({status:'BLOCKED',reason,published:false,productionCutover:false});
 if(enabled!==true)return blocked('STAGING_PIPELINE_DISABLED');
 if(!store?.withLock||!api)return blocked('STAGING_DEPENDENCIES_MISSING');
 return store.withLock(async journal=>{
  try{
   const pending=await journal.pending();
   // Finish a durable previous session before starting new financial decisions.
   const targetDate=pending||date||localET(clock().toISOString()).date;
   let saved=await journal.get(targetDate);
   if(!saved){
    let record=await readRun({url,date:targetDate});
    if(!record){
     if(validateMorningTrigger({date:targetDate,runAt:clock().toISOString()}).status!=='PASS')return blocked('OUTSIDE_MORNING_DECISION_WINDOW');
     if(typeof prepareProviders!=='function')return blocked('RESEARCH_PROVIDERS_MISSING');
     const providers=await prepareProviders({date:targetDate,journal});
     const runAt=clock().toISOString();
     // Collection can consume the window: never backdate its completion.
     if(validateMorningTrigger({date:targetDate,runAt}).status!=='PASS')return blocked('RESEARCH_COMPLETED_AFTER_DECISION_WINDOW');
     await journal.guard();
     const result=await runCycle({url,date:targetDate,runAt,clock,...providers,allowIndicativeFallback:true});
     if(!['SHADOW_COMMITTED','IDEMPOTENT_REPLAY'].includes(result.status))return blocked('MODEL_CYCLE:'+result.reason);
     record=await readRun({url,date:targetDate});
    }
    if(!record)throw Error('COMMITTED_RUN_READBACK_MISSING');
    const latest=await readState({url});
    if(latest?.date!==targetDate)throw Error('SUPERSEDED_COMMITTED_RUN');
    saved=await journal.save(buildStagingArtifact(record,latest.history||[]));
   }
   const artifact=assertArtifact(saved.artifact),{manifest,feed}=artifact;
   let state=saved.state;
   if(['DELIVERED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED'].includes(state.delivery))return {status:state.delivery,runId:manifest.payload.runId,published:false,productionCutover:false};
   await journal.guard();
   const receipt=await publish({api,...artifact,enabled:'YES'});
   if(receipt.status!=='STAGING_COMMITTED_READBACK_PASS')return blocked('SHEET:'+receipt.reason);
   state=await journal.update(targetDate,{sheet:'VERIFIED',sheetReceipt:receipt});
   await journal.guard();
   const parity=await readback({manifest,sheet:receipt.sheet,apiUrl:SHADOW_ORIGIN+'/v2/model/snapshot',htmlUrl:SHADOW_ORIGIN+'/v2/swing-trading',fetcher});
   if(parity.status!=='VERIFIED')return blocked('WEBSITE:'+parity.reason);
   state=await journal.update(targetDate,{publication:'VERIFIED'});
   if(!emailEnabled){await journal.update(targetDate,{delivery:'EMAIL_DISABLED'});return {status:'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED',date:targetDate,snapshotId:feed.snapshot_id,published:false,productionCutover:false};}
   if(!recipient||recipient!==allowedRecipient)return blocked('STAGING_RECIPIENT_NOT_ALLOWLISTED');
   let plan=state.emailPlan;
   if(!plan){
    plan=prepareReviewEmail({manifest,sheet:receipt.sheet,api:parity.api,html:parity.html,recipient});
    if(plan.status!=='VERIFIED_DELIVERY_PLAN')return blocked('EMAIL:'+plan.reason);
    plan.subject='[STAGING — NOT LIVE] '+plan.subject;
    plan.text='PRIVATE ENGINE 2 STAGING VALIDATION — NOT A LIVE PORTFOLIO UPDATE\n\n'+plan.text;
    state=await journal.update(targetDate,{emailPlan:plan});
   }
   if(plan.to!==recipient||plan.snapshotId!==manifest.fingerprint)throw Error('IMMUTABLE_EMAIL_PLAN_CONFLICT');
   if(!state.messageId){
    const now=clock().toISOString();
    if(state.firstSendAt&&Date.parse(now)-Date.parse(state.firstSendAt)>=23*3600000)return blocked('SEND_OUTCOME_UNKNOWN_IDEMPOTENCY_WINDOW_EXPIRED');
    state=await journal.update(targetDate,{firstSendAt:state.firstSendAt||now,delivery:'SEND_ATTEMPTED'});
    await journal.guard();
    const sent=await send({plan,lease:{status:'VERIFIED_AND_LEASED',runId:plan.runId,snapshotId:plan.snapshotId},apiKey,fetchFn:fetcher});
    if(sent.status!=='ACCEPTED_NOT_DELIVERED')return blocked('EMAIL:'+sent.reason);
    state=await journal.update(targetDate,{messageId:sent.messageId,delivery:'ACCEPTED_NOT_DELIVERED'});
   }
   const proof=await delivery({messageId:state.messageId,plan,apiKey,fetchFn:fetcher});
   if(proof.status==='BLOCKED')return blocked('DELIVERY:'+proof.reason);
   await journal.update(targetDate,{delivery:proof.status,deliveryCheckedAt:clock().toISOString()});
   return {status:proof.status,runId:plan.runId,snapshotId:plan.snapshotId,messageId:state.messageId,published:false,productionCutover:false};
  }catch(e){return blocked(e.message)}
 });
}
module.exports={runStagingPipeline,SHADOW_ORIGIN};
