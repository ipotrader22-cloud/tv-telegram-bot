'use strict';
// Shadow-only email contract. Never send before exact verified Sheet/API/HTML.
const crypto=require('node:crypto');
const {verifyPublication}=require('./publication-contract.cjs');
function prepareReviewEmail({manifest,sheet,api,html,recipient}={}){
 const no=reason=>({status:'BLOCKED',reason,sendable:false});
 const check=verifyPublication({manifest,sheet,api,html});
 if(check.status!=='VERIFIED')return no('PUBLICATION_NOT_VERIFIED:'+check.reason);
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient||''))return no('UNVERIFIED_RECIPIENT');
 const p=manifest.payload;
 if(p.epoch!=='2026-10-19'||!p.date||!p.runId)return no('WRONG_EPOCH');
 const key='vixale-engine2-'+p.date+'-'+crypto.createHash('sha256').update(p.runId+manifest.fingerprint).digest('hex').slice(0,16);
 const lines=['VIXALE Active Portfolio '+p.date,'',
 'Model equity $'+Number(p.model.equity).toFixed(2),
 'Open model holdings '+p.model.activeCount,
 'Normalized P&L $'+Number(p.model.total).toFixed(2),'',
 ...p.active.map(a=>a.ticker+' entry $'+Number(a.entryPrice).toFixed(2)+' score '+a.score+' reviewed '+a.reviewDate+': '+a.note),
 '', 'Model portfolio research only. No actual broker execution.'];
 return {status:'VERIFIED_DELIVERY_PLAN',sendable:false,requiresOutboxLease:true,
 from:'Vixale Alerts <alerts@vixale.com>',to:recipient,subject:'Vixale Swing Leaders — Morning Review — '+p.date,
 text:lines.join('\n'),runId:p.runId,snapshotId:check.snapshotId,idempotencyKey:key};
}
async function deliverLeasedPlan({plan,lease,sendFn}={}){
 if(plan?.status!=='VERIFIED_DELIVERY_PLAN'||!plan.requiresOutboxLease||
    lease?.status!=='VERIFIED_AND_LEASED'||lease.runId!==plan.runId||
    lease.snapshotId!==plan.snapshotId||typeof sendFn!=='function')
  return {status:'BLOCKED',reason:'VERIFIED_LEASE_REQUIRED'};
 try{
  const x=await sendFn({from:plan.from,to:[plan.to],subject:plan.subject,text:plan.text,
  headers:{'Idempotency-Key':plan.idempotencyKey}});
  const id=x?.id||x?.data?.id;
  return id?{status:'ACCEPTED_NOT_DELIVERED',messageId:id,idempotencyKey:plan.idempotencyKey}:
   {status:'BLOCKED',reason:'NO_RESEND_MESSAGE_ID'};
 }catch{return {status:'BLOCKED',reason:'RESEND_SEND_FAILED'}}
}
module.exports={prepareReviewEmail,deliverLeasedPlan};
