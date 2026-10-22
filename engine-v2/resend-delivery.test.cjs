'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readResendDelivery}=require('./resend-client.cjs');
const plan={from:'Vixale Alerts <alerts@vixale.com>',to:'owner@example.test',subject:'Test',text:'Test content'};
const check=(changes={})=>readResendDelivery({messageId:'test-id',plan,apiKey:'re_test',fetchFn:async()=>new Response(JSON.stringify({id:'test-id',...plan,to:[plan.to],cc:[],bcc:[],last_event:'sent',...changes}))});
test('accepted or delayed email is never called delivered',async()=>{assert.equal((await check()).status,'ACCEPTED_NOT_DELIVERED');assert.equal((await check({last_event:'delivery_delayed'})).status,'ACCEPTED_NOT_DELIVERED')});
test('provider delivery and terminal failures retain distinct states',async()=>{for(const x of ['delivered','bounced','complained','failed','suppressed'])assert.equal((await check({last_event:x})).status,x.toUpperCase())});
test('wrong recipient, message text, or hidden copies cannot prove delivery',async()=>{for(const changes of [{to:['other@example.test']},{text:'different'},{bcc:['other@example.test']}])assert.equal((await check({...changes,last_event:'delivered'})).status,'BLOCKED')});
