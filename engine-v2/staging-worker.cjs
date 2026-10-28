'use strict';
const {createPipelineStore}=require('./staging-pipeline-store.cjs');
const {runStagingPipeline}=require('./staging-pipeline.cjs');
const {createSheetsClient,readMeta}=require('./staging-sheets-publisher.cjs');
const {createResearchRuntime}=require('./staging-research-runtime.cjs');
function assertCachedPreopen(prepared,{date,prior,now}={}){
 return require('./delayed-model-policy.cjs').validatePrepared(prepared,{date,previous:prior,now});
}
const SAFE_BLOCK_REASONS=new Set(['STAGING_CONFIGURATION_INCOMPLETE','STAGING_WORKBOOK_METADATA_UNVERIFIED','PREOPEN_PREPARATION_MISSING','STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE',
 'STAGING_LEDGER_EXCEPTION','STAGING_RESEARCH_EXCEPTION','STAGING_MODEL_EXCEPTION','STAGING_SHEET_EXCEPTION','STAGING_WEBSITE_EXCEPTION','STAGING_EMAIL_EXCEPTION']);
function createStagingWorker({env=process.env,url,clock=()=>new Date(),fetcher=fetch}={}){
 const store=createPipelineStore({url});
 const delayed=env.VIXALE_V2_STAGING_PRICE_POLICY==='DELAYED_0940_MODEL_V1';
 const enabled=env.VIXALE_V2_STAGING_PIPELINE_ENABLED==='YES';
 const emailEnabled=env.VIXALE_V2_STAGING_EMAIL_ENABLED==='YES';
 let flight=null,last={status:enabled?'PENDING':'DISABLED'},api,prepareProviders;
 const missing=[];
 if(!env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON)missing.push('STAGING_SERVICE_ACCOUNT');
 if(!env.VIXALE_V2_RESEARCH_UNIVERSE)missing.push('INDEPENDENT_RESEARCH_UNIVERSE');
 if(!env.VIXALE_V2_RESEARCH_SECTORS_JSON)missing.push('RESEARCH_SECTOR_MAP');
 if(emailEnabled&&(!env.VIXALE_V2_STAGING_EMAIL_TO||env.VIXALE_V2_STAGING_EMAIL_TO!==env.VIXALE_V2_STAGING_EMAIL_ALLOWLIST))missing.push('STAGING_EMAIL_RECIPIENT');
 if(emailEnabled&&!env.VIXALE_V2_STAGING_RESEND_API_KEY)missing.push('STAGING_RESEND_CREDENTIAL');
 if(enabled&&!missing.length)try{
  api=createSheetsClient(env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON);
  prepareProviders=createResearchRuntime({universeCsv:env.VIXALE_V2_RESEARCH_UNIVERSE,sectorByTicker:JSON.parse(env.VIXALE_V2_RESEARCH_SECTORS_JSON),clock,fetchFn:fetcher});
 }catch{missing.push('INVALID_STAGING_CONFIGURATION')}
 return {
  store,
  async prepare(){
   if(!enabled||missing.length)return {status:'BLOCKED',reason:'STAGING_CONFIGURATION_INCOMPLETE'};
   const date=require('./market-data-adapter.cjs').localET(clock().toISOString()).date;
   return store.withLock(async journal=>{
    const cached=await journal.getPrepared(date);
    if(cached){
     // A persisted pre-open row is not proof by itself. Recheck its hash,
     // completed session and the immutable clean-epoch predecessor before
     // reporting success or allowing the 10:00 model cycle to reuse it.
     const prior=await require('./clean-ledger.cjs').readLastCleanState({url});
     assertCachedPreopen(cached,{date,prior,now:clock().toISOString()});
     return {status:'PREOPEN_PREPARED'};
    }
    const p=await require('./preopen-preparation.cjs').preparePreopen({date,url,env,clock,fetchFn:fetcher});
    await journal.savePrepared(p);return {status:'PREOPEN_PREPARED'};
   });
  },
  status:()=>({enabled,emailEnabled,missing:[...missing],status:last.status,reason:last.reason||null,lastCheckedAt:last.checkedAt||null,readyForProduction:false}),
  tick(){
   if(!enabled)return Promise.resolve(last);
   if(flight)return flight;
   if(missing.length){last={status:'BLOCKED',reason:'STAGING_CONFIGURATION_INCOMPLETE'};return Promise.resolve(last)}
   flight=(async()=>{
    // Verify workbook identity/access before collecting or committing decisions.
    const metadata=await readMeta(api);
    if(metadata.status!=='PASS')return {status:'BLOCKED',reason:'STAGING_WORKBOOK_METADATA_UNVERIFIED'};
    return runStagingPipeline({store,url,api,clock,prepareProviders:delayed?async({date,journal})=>{
      const prepared=await journal.getPrepared(date);if(!prepared)throw Error('PREOPEN_PREPARATION_MISSING');
      return {prepared,quoteProvider:require('./preopen-preparation.cjs').createFixedQuoteProvider({fetchFn:fetcher,clock})};
     }:prepareProviders,
     ...(delayed?{runCycle:require('./delayed-model-cycle.cjs').runDelayedCycle}:{}),fetcher,enabled:true,emailEnabled,
     recipient:env.VIXALE_V2_STAGING_EMAIL_TO,allowedRecipient:env.VIXALE_V2_STAGING_EMAIL_ALLOWLIST,apiKey:env.VIXALE_V2_STAGING_RESEND_API_KEY});
   })().catch(()=>({status:'BLOCKED',reason:'STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE'})).then(result=>{
    // Never publish provider exceptions, private inputs, recipients or credentials.
    last={status:result.status,reason:result.status==='BLOCKED'?(SAFE_BLOCK_REASONS.has(result.reason)?result.reason:
   /^SHEET:/.test(result.reason||'')?'STAGING_SHEET_VERIFICATION_FAILED':
   /^WEBSITE:/.test(result.reason||'')?'STAGING_WEBSITE_PARITY_FAILED':
   /^MODEL_CYCLE:/.test(result.reason||'')?'STAGING_MODEL_CYCLE_FAILED':
   'STAGING_VERIFICATION_INCOMPLETE'):null,checkedAt:clock().toISOString()};
    return last;
   }).finally(()=>{flight=null});
   return flight;
  }
 };
}
module.exports={createStagingWorker,assertCachedPreopen};
