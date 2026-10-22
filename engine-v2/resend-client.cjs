'use strict';
// Narrow authenticated Resend transport. Never calls send without a verified
// durable outbox lease checked by resend-review-outbox.cjs.
const {deliverLeasedPlan}=require('./resend-review-outbox.cjs');
const ORIGIN='https://api.resend.com/emails';
async function sendViaResend({plan,lease,apiKey,fetchFn=fetch}={}){
 if(typeof apiKey!=='string'||!/^re_/.test(apiKey))return {status:'BLOCKED',reason:'RESEND_CREDENTIAL_UNAVAILABLE'};
 if(plan?.status!=='VERIFIED_DELIVERY_PLAN'||lease?.status!=='VERIFIED_AND_LEASED'||
    lease.runId!==plan.runId||lease.snapshotId!==plan.snapshotId)
   return {status:'BLOCKED',reason:'VERIFIED_LEASE_REQUIRED'};
 return deliverLeasedPlan({plan,lease,sendFn:async ({from,to,subject,text,headers})=>{
  const response=await fetchFn(ORIGIN,{method:'POST',redirect:'error',headers:{
   'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':headers['Idempotency-Key']
  },body:JSON.stringify({from,to,subject,text}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Resend refused message, HTTP '+response.status);
  return response.json();
 }});
}
module.exports={sendViaResend};
