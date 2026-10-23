'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sendViaResend}=require('./resend-client.cjs');
const plan={status:'VERIFIED_DELIVERY_PLAN',requiresOutboxLease:true,runId:'run',snapshotId:'sha',idempotencyKey:'vixale-once',from:'Vixale Alerts <alerts@vixale.com>',to:'owner@example.com',subject:'Morning',text:'Model'};
const lease={status:'VERIFIED_AND_LEASED',runId:'run',snapshotId:'sha'};
test('never call provider without configured key and authorization',async()=>{
 let count=0;
 const r=await sendViaResend({plan,lease,fetchFn:async()=>{count++}});
 assert.equal(r.reason,'RESEND_CREDENTIAL_UNAVAILABLE');assert.equal(count,0);
});
test('outbox lease required even with credential',async()=>{
 let count=0;
 const r=await sendViaResend({apiKey:'re_test_key',plan,lease:{...lease,snapshotId:'different'},fetchFn:async()=>{count++}});
 assert.equal(r.reason,'VERIFIED_LEASE_REQUIRED');assert.equal(count,0);
});
test('API transport preserves idempotency and never claims delivery',async()=>{
 const r=await sendViaResend({apiKey:'re_test_key',plan,lease,fetchFn:async (url,options)=>{
   assert.equal(url,'https://api.resend.com/emails');
   assert.equal(options.headers['Idempotency-Key'],'vixale-once');
   assert.equal(JSON.parse(options.body).to[0],'owner@example.com');
   return {ok:true,json:async()=>({id:'mail-123'})};
 }});
 assert.equal(r.status,'ACCEPTED_NOT_DELIVERED');assert.equal(r.messageId,'mail-123');
});
