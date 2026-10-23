'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareReviewEmail,deliverLeasedPlan}=require('./resend-review-outbox.cjs');
test('cannot prepare email before published three-surface readback',()=>{
 const x=prepareReviewEmail({manifest:{status:'PUBLICATION_PLAN_ONLY'},recipient:'owner@example.com'});
 assert.equal(x.status,'BLOCKED');assert.equal(x.sendable,false);
});
test('must not send without durable verified outbox lease',async()=>{
 let sent=0;
 const plan={status:'VERIFIED_DELIVERY_PLAN',requiresOutboxLease:true,runId:'r',snapshotId:'s'};
 const x=await deliverLeasedPlan({plan,lease:{status:'NOT_VERIFIED'},sendFn:async()=>{sent++}});
 assert.equal(x.status,'BLOCKED');assert.equal(sent,0);
});
test('correct leased run returns provider accepted but not delivered',async()=>{
 let calls=0;
 const plan={status:'VERIFIED_DELIVERY_PLAN',requiresOutboxLease:true,runId:'r',snapshotId:'s',from:'Vixale Alerts <alerts@vixale.com>',to:'owner@example.com',subject:'Test',text:'Verified',idempotencyKey:'fixed-key'};
 const x=await deliverLeasedPlan({plan,lease:{status:'VERIFIED_AND_LEASED',runId:'r',snapshotId:'s'},sendFn:async options=>{calls++;assert.equal(options.headers['Idempotency-Key'],'fixed-key');return {id:'resend1'}}});
 assert.equal(calls,1);assert.equal(x.status,'ACCEPTED_NOT_DELIVERED');
});
