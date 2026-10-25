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
 assert.equal(x.result.reason,'STAGING_RUN_FAILED');assert.ok(!JSON.stringify(x.result).includes('re_secret'));
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
