'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readResendDelivery,sendViaResend}=require('./resend-client.cjs');
const plan={status:'VERIFIED_DELIVERY_PLAN',requiresOutboxLease:true,runId:'review-2026-10-30',snapshotId:'snapshot',idempotencyKey:'engine2-exact-session',from:'Vixale Alerts <alerts@vixale.com>',to:'staging@example.test',subject:'[STAGING — NOT LIVE] Review',text:'PRIVATE ENGINE 2 TEST'};
const data={id:'test-id',from:plan.from,to:[plan.to],subject:plan.subject,text:plan.text,cc:[],bcc:[]};
const fetchFor=(payload,status=200)=>async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails/test-id');assert.equal(opts.method,undefined);return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}})};
test('provider accepted is not mistaken for delivered',async()=>{
 const r=await readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:fetchFor({...data,last_event:'sent'})});
 assert.equal(r.status,'ACCEPTED_NOT_DELIVERED');
});
test('provider delivered requires exact immutable message identity',async()=>{
 const r=await readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:fetchFor({...data,last_event:'delivered'})});
 assert.equal(r.status,'DELIVERED');
});
test('mismatched provider identity blocks alleged delivery, even with delivered event',async()=>{
 for(const variant of [{to:['someone-else@example.test']},{subject:'another report'},{text:'altered portfolio'},{id:'another-id'},{cc:['unknown@example.test']}]) {
  const r=await readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:fetchFor({...data,...variant,last_event:'delivered'})});
  assert.equal(r.reason,'DELIVERY_MESSAGE_IDENTITY_MISMATCH');
 }
});
test('provider permanent negative status never passes delivery gate',async()=>{
 for(const event of ['bounced','complained','failed','suppressed']){
  const r=await readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:fetchFor({...data,last_event:event})});
  assert.equal(r.status,event.toUpperCase());
 }
});
test('failed provider lookup never claims delivery',async()=>{
 const r=await readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:fetchFor({...data,last_event:'delivered'},503)});
 assert.equal(r.status,'BLOCKED');
});
test('no credential or unverified lease means no send and no provider interaction',async()=>{
 let calls=0;const fetchFn=async()=>{calls++;throw Error('not authorized')};
 const lease={status:'VERIFIED_AND_LEASED',runId:plan.runId,snapshotId:plan.snapshotId};
 assert.equal((await sendViaResend({plan,lease,fetchFn})).status,'BLOCKED');
 assert.equal((await sendViaResend({plan,lease:{...lease,snapshotId:'wrong'},apiKey:'re_test',fetchFn})).status,'BLOCKED');
 assert.equal(calls,0);
});
