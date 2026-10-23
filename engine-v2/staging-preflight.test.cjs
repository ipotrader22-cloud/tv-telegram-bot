'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {stagingPreflight}=require('./staging-preflight.cjs');
const env={VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'vixale-engine2-staging@tv-trading-journal.iam.gserviceaccount.com',private_key:'private-test-value'})};
test('preflight reads staging metadata even with publication disabled',async()=>{
 let calls=0;
 const result=await stagingPreflight({env,makeClient:()=>({readOnly:true}),read:async api=>{assert.equal(api.readOnly,true);calls++;return {status:'PASS'}}});
 assert.equal(calls,1);assert.equal(result.workbook,'AUTHENTICATED_READ_VERIFIED');assert.equal(result.writesPerformed,false);
});
test('preflight rejects the production identity without using its credentials',async()=>{
 const result=await stagingPreflight({env:{...env,VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'production@example.com'})},makeClient:()=>{throw Error('must not construct')}});
 assert.equal(result.workbook,'STAGING_IDENTITY_MISMATCH');
});
test('preflight sanitizes authentication errors and distinguishes missing credentials',async()=>{
 assert.equal((await stagingPreflight({env:{}})).workbook,'NOT_CONFIGURED');
 const result=await stagingPreflight({env,makeClient:()=>{throw Error('private-test-value')}});
 assert.equal(result.workbook,'AUTHENTICATION_OR_ACCESS_FAILED');assert.ok(!JSON.stringify(result).includes('private-test-value'));
});
test('preflight checks research configuration without collecting market data',async()=>{
 const result=await stagingPreflight({env:{VIXALE_V2_RESEARCH_UNIVERSE:'AMD',VIXALE_V2_RESEARCH_SECTORS_JSON:'{"AMD":"SMH"}'}});
 assert.equal(result.research,'CONFIG_VALID_NOT_PROVIDER_VERIFIED');
 const bad=await stagingPreflight({env:{VIXALE_V2_RESEARCH_UNIVERSE:'AMD',VIXALE_V2_RESEARCH_SECTORS_JSON:'{}'}});
 assert.equal(bad.research,'INVALID_CONFIGURATION');
});
