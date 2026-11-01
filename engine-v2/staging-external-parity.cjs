'use strict';
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const ORIGIN='https://vixale-engine-v2-shadow-observer.onrender.com';
async function probe({origin=ORIGIN,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.hostname!=='vixale-engine-v2-shadow-observer.onrender.com'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('UNAPPROVED_STAGING_ORIGIN');
 const paths=['/health','/v2/model/snapshot','/v2/swing-trading'],replies=[];
 for(const path of paths){
  let response;
  for(let attempt=0;attempt<3;attempt++){
   if(attempt)await pause(attempt===1?3000:8000);
   try{
    response=await fetcher(origin+path,{method:'GET',redirect:'error',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
   }catch{
    if(attempt===2)throw Error('STAGING_TRANSPORT_UNAVAILABLE:'+path);
    continue;
   }
   if(response.status===200)break;
   if(response.status!==429&&response.status<500)throw Error('STAGING_HTTP_NOT_200:'+path+':'+response.status);
   if(attempt===2)throw Error('STAGING_TRANSIENT_HTTP_EXHAUSTED:'+path);
  }
  if(!/no-store/i.test(response.headers.get('cache-control')||''))throw Error('STAGING_CACHE_POLICY:'+path);
  replies.push(response);
 }
 const [health,feed,html]=await Promise.all([replies[0].json(),replies[1].json(),replies[2].text()]);
 if(health.mode!=='READ_ONLY'||health.databaseConnected!==true||health.schemaInitialized!==true)throw Error('SHADOW_HEALTH_UNVERIFIED');
 if(health.stagingPipeline?.emailEnabled!==false)throw Error('STAGING_EMAIL_NOT_DISABLED');
 if(health.cleanSlate?.epoch!=='2026-10-19'||health.cleanSlate?.readyForProduction!==false)throw Error('SHADOW_EPOCH_OR_SAFETY_INVALID');
 if(feed.version!==2||feed.epoch!=='2026-10-19'||!/^20\\d{2}-\\d{2}-\\d{2}$/.test(feed.snapshot_date||'')||feed.snapshot_date<'2026-10-19'||!Array.isArray(feed.active_portfolio)||!Array.isArray(feed.closed_trades)||!Array.isArray(feed.candidates))throw Error('SNAPSHOT_SCHEMA_UNVERIFIED');
 if(!/^[a-f0-9]{64}$/i.test(feed.snapshot_id||''))throw Error('SNAPSHOT_FINGERPRINT_INVALID');
 if(feed.active_portfolio.length!==feed.active_count||feed.active_count>10)throw Error('ACTIVE_MEMBERSHIP_MISMATCH');
 if(html!==renderShadowSwing(feed))throw Error('EXACT_VISIBLE_HTML_MISMATCH');
 return {status:'EXTERNAL_STAGING_API_HTML_PASS',snapshotDate:feed.snapshot_date,snapshotId:feed.snapshot_id,activeCount:feed.active_count,readOnly:true,emailEnabled:false,productionCutover:false};
}
if(require.main===module)probe().then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message,productionCutover:false}));process.exitCode=1});
module.exports={probe};
