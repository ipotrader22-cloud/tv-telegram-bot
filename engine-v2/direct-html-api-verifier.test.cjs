'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyDirect}=require('./direct-html-api-verifier.cjs');
test('direct verification blocks missing staging endpoints',async()=>{
 const x=await verifyDirect({});
 assert.equal(x.status,'BLOCKED');
});
test('HTTP failure cannot certify publication',async()=>{
 const x=await verifyDirect({apiUrl:'staging-api',htmlUrl:'staging-html',fetcher:async()=>({ok:false})});
 assert.equal(x.reason,'HTTP_ERROR');
});
