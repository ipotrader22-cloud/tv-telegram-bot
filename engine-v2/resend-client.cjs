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
async function readResendDelivery({messageId,plan,apiKey,fetchFn=fetch}={}){
 const bad=reason=>({status:'BLOCKED',reason});
 if(!/^re_/.test(apiKey||'')||!/^[-a-zA-Z0-9]{1,100}$/.test(messageId||'')||!plan)return bad('DELIVERY_LOOKUP_NOT_CONFIGURED');
 try{
  const response=await fetchFn(ORIGIN+'/'+encodeURIComponent(messageId),{redirect:'error',headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return bad('DELIVERY_LOOKUP_HTTP_'+response.status);
  const x=await response.json();
  if(x.id!==messageId||x.from!==plan.from||x.subject!==plan.subject||x.text!==plan.text||
   !Array.isArray(x.to)||x.to.length!==1||x.to[0]!==plan.to||x.cc?.length||x.bcc?.length)return bad('DELIVERY_MESSAGE_IDENTITY_MISMATCH');
  const event=x.last_event;
  if(['delivered','opened','clicked'].includes(event))return {status:'DELIVERED',messageId,event};
  if(['bounced','complained','failed','suppressed'].includes(event))return {status:event.toUpperCase(),messageId,event};
  return {status:'ACCEPTED_NOT_DELIVERED',messageId,event};
 }catch{return bad('DELIVERY_LOOKUP_FAILED')}
}
module.exports={sendViaResend,readResendDelivery};
