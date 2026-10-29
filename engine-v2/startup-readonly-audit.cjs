'use strict';
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
async function auditReadOnlySurface({port,googleProbe,fetcher=fetch}={}){
 const blocked=()=>({status:'BLOCKED',reason:'STARTUP_READBACK_UNAVAILABLE',writesPerformed:false});
 try{
  if(!Number.isInteger(port)||port<1||port>65535)return blocked();
  const base='http://127.0.0.1:'+port,opts={redirect:'error',signal:AbortSignal.timeout(15000)};
  const [a,h,s]=await Promise.all(['/v2/model/snapshot','/v2/swing-trading','/health'].map(p=>fetcher(base+p,opts)));
  if(!a.ok||!h.ok||!s.ok)return blocked();
  const [feed,html,health]=await Promise.all([a.json(),h.text(),s.json()]);
  const exactHtml=html===renderShadowSwing(feed);
  const g=await googleProbe();
  const sourceStatus=g.status==='GOOGLE_MODEL_QUOTES_OBSERVED'?'VALID_CURRENT_QUOTES':
   g.reason==='GOOGLE_QUOTE_STALE_OR_INVALID'?'SOURCE_READ_VERIFIED_QUOTES_STALE_OR_INVALID':'SOURCE_NOT_VERIFIED';
  return {status:exactHtml?'EXACT_API_HTML_MATCH':'BLOCKED',exactHtml,
   snapshotDate:feed.snapshot_date,snapshotId:feed.snapshot_id,
   pricePolicyConfigured:health.stagingPipeline?.pricePolicy||null,
   databaseConnected:health.databaseConnected===true,
   emailEnabled:health.stagingPipeline?.emailEnabled===true,
   writerEnabled:health.stagingPipeline?.enabled===true,
   googleSourceStatus:sourceStatus,writesPerformed:false};
 }catch{return blocked();}
}
module.exports={auditReadOnlySurface};
