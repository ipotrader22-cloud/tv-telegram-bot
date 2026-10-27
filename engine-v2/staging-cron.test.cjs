'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runScheduled}=require('./staging-cron.cjs');
const env={VIXALE_V2_SHADOW_MODE:'READ_ONLY',VIXALE_V2_SHADOW_DATABASE_URL:'postgres://localhost/vixale_engine_v2_shadow_20990101'};
function invoke(at,opts={}){
 let calls=0;
 return runScheduled({env,clock:()=>new Date(at),createWorker:()=>{calls++;return {
  status:()=>({enabled:true,missing:[]}),tick:async()=>({status:'DELIVERED'})
 }},...opts}).then(result=>({result,calls}));
}
test('cron follows ET across DST and skips the alternate UTC hour',async()=>{
 for(const at of ['2026-10-23T14:00:00Z','2026-11-02T15:00:00Z']){
  const x=await invoke(at);assert.equal(x.result.status,'DELIVERED');assert.equal(x.calls,1);
 }
 for(const at of ['2026-10-23T15:00:00Z','2026-11-02T14:00:00Z']){
  const x=await invoke(at);assert.equal(x.result.status,'SKIPPED');assert.equal(x.calls,0);
 }
});
test('cron skips closed sessions and rejects an unmaintained calendar',async()=>{
 for(const at of ['2026-10-24T14:00:00Z','2026-11-26T15:00:00Z']){
  const x=await invoke(at);assert.equal(x.result.reason,'NYSE_CLOSED');assert.equal(x.calls,0);
 }
 assert.equal((await invoke('2029-01-02T15:00:00Z')).result.exitCode,1);
});
test('cron cannot construct a worker against production or without shadow mode',async()=>{
 for(const bad of [{...env,VIXALE_V2_SHADOW_DATABASE_URL:'postgres://localhost/production'},{...env,VIXALE_V2_SHADOW_MODE:'LIVE'}]){
  const x=await invoke('2026-10-23T14:00:00Z',{env:bad});assert.equal(x.calls,0);assert.equal(x.result.exitCode,1);
 }
});
test('cron reports failed delivery and sanitizes exceptions',async()=>{
 for(const status of ['BOUNCED','COMPLAINED','FAILED','SUPPRESSED','BLOCKED','unexpected-secret']){
  const x=await invoke('2026-10-23T14:10:00Z',{createWorker:()=>({status:()=>({enabled:true,missing:[]}),tick:async()=>({status,reason:'private-provider-error'})})});
  assert.equal(x.result.exitCode,1);assert.ok(!JSON.stringify(x.result).includes('secret'));assert.ok(!JSON.stringify(x.result).includes('private'));
 }
 const x=await invoke('2026-10-23T14:00:00Z',{createWorker:()=>{throw Error('re_secret')}});
 assert.equal(x.result.reason,'STAGING_WORKER_INITIALIZATION_FAILED');assert.ok(!JSON.stringify(x.result).includes('re_secret'));
});
test('cron blocks missing configuration and leaves pending delivery distinct',async()=>{
 const x=await invoke('2026-10-23T14:00:00Z',{createWorker:()=>({status:()=>({enabled:false,missing:[]}),tick:()=>{throw Error('must not run')}})});
 assert.equal(x.result.reason,'STAGING_CONFIGURATION_INCOMPLETE');
 const y=await invoke('2026-10-23T14:10:00Z',{createWorker:()=>({status:()=>({enabled:true,missing:[]}),tick:async()=>({status:'ACCEPTED_NOT_DELIVERED'})})});
 assert.equal(y.result.status,'ACCEPTED_NOT_DELIVERED');
});

test('cron reports exact allowlisted missing capabilities without leaking provider values',async()=>{
 const x=await invoke('2026-10-23T14:00:00Z',{createWorker:()=>({
  status:()=>({enabled:true,missing:['STAGING_SERVICE_ACCOUNT','RESEARCH_SECTOR_MAP','sensitive-api-key-value']}),
  tick:()=>{throw Error('must not reach provider')}
 })});
 assert.equal(x.result.status,'BLOCKED');
 assert.deepEqual(x.result.missingCapabilities,['STAGING_SERVICE_ACCOUNT','RESEARCH_SECTOR_MAP']);
 assert.ok(!JSON.stringify(x.result).includes('sensitive-api-key-value'));
 const disabled=await invoke('2026-10-23T14:00:00Z',{createWorker:()=>({
  status:()=>({enabled:false,missing:[]}),tick:()=>{throw Error('must not run')}
 })});
 assert.deepEqual(disabled.result.missingCapabilities,['STAGING_PIPELINE_ENABLED']);
});

test('cron distinguishes malformed shadow URL without echoing credentials',async()=>{
 const x=await invoke('2026-10-23T14:00:00Z',{env:{...env,VIXALE_V2_SHADOW_DATABASE_URL:'not-a-url-secret'}});
 assert.equal(x.result.reason,'SHADOW_DATABASE_REQUIRED');assert.equal(x.calls,0);
 assert.ok(!JSON.stringify(x.result).includes('secret'));
});
test('cron identifies preopen provider failure without leaking error contents',async()=>{
 const x=await invoke('2026-10-23T12:10:00Z',{
  env:{...env,VIXALE_V2_STAGING_PRICE_POLICY:'DELAYED_0940_MODEL_V1'},
  createWorker:()=>({status:()=>({enabled:true,missing:[]}),prepare:async()=>{throw Error('private-provider-secret')}})
 });
 assert.equal(x.result.reason,'PREOPEN_PREPARATION_FAILED');assert.equal(x.result.exitCode,1);
 assert.ok(!JSON.stringify(x.result).includes('secret'));
});
test('cron identifies worker configuration failure without exposing error details',async()=>{
 const x=await invoke('2026-10-23T14:00:00Z',{
  createWorker:()=>({status:()=>{throw Error('credential-secret')}})
 });
 assert.equal(x.result.reason,'STAGING_WORKER_CONFIGURATION_FAILED');
 assert.ok(!JSON.stringify(x.result).includes('secret'));
});

test('cron retains only allowlisted morning block reasons and never exposes provider details',async()=>{
 const allowed=['STAGING_WORKBOOK_METADATA_UNVERIFIED','PREOPEN_PREPARATION_MISSING',
  'STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE','STAGING_VERIFICATION_INCOMPLETE'];
 for(const reason of allowed){
  const x=await invoke('2026-10-27T14:02:00Z',{createWorker:()=>({
   status:()=>({enabled:true,missing:[]}),tick:async()=>({status:'BLOCKED',reason})
  })});
  assert.equal(x.result.status,'BLOCKED');assert.equal(x.result.reason,reason);
  assert.equal(x.result.exitCode,1);assert.equal(x.result.productionCutover,false);
 }
 for(const reason of ['private-provider-secret','MODEL_CYCLE:private-provider-secret',undefined]){
  const x=await invoke('2026-10-27T14:02:00Z',{createWorker:()=>({
   status:()=>({enabled:true,missing:[]}),tick:async()=>({status:'BLOCKED',reason})
  })});
  assert.equal(x.result.reason,'STAGING_RUN_REQUIRES_ATTENTION');
  assert.ok(!JSON.stringify(x.result).includes('private-provider-secret'));
 }
 const preopen=await invoke('2026-10-27T12:15:00Z',{
  env:{...env,VIXALE_V2_STAGING_PRICE_POLICY:'DELAYED_0940_MODEL_V1'},
  createWorker:()=>({status:()=>({enabled:true,missing:[]}),
   prepare:async()=>({status:'BLOCKED',reason:'STAGING_CONFIGURATION_INCOMPLETE'})})
 });
 assert.equal(preopen.result.reason,'STAGING_CONFIGURATION_INCOMPLETE');
});
