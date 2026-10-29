'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditReadOnlySurface}=require('./startup-readonly-audit.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const feed={version:2,epoch:'2026-10-19',active_portfolio:[],closed_trades:[],status:'SHADOW_REVIEW_COMMITTED_NOT_PUBLISHED',snapshot_date:'2026-10-27',snapshot_id:'proof',active_count:0};
test('startup audit checks actual read-only routes, Google state and disabled email',async()=>{
 const urls=[],fetcher=async url=>{
  urls.push(url);return {ok:true,json:async()=>url.endsWith('/health')?{databaseConnected:true,stagingPipeline:{enabled:false,emailEnabled:false,pricePolicy:'GOOGLE_LATEST_1000_MODEL_V1'}}:feed,text:async()=>renderShadowSwing(feed)};
 };
 const r=await auditReadOnlySurface({port:10000,fetcher,googleProbe:async()=>({status:'BLOCKED',reason:'GOOGLE_QUOTE_STALE_OR_INVALID'})});
 assert.equal(r.exactHtml,true);assert.equal(r.googleSourceStatus,'SOURCE_READ_VERIFIED_QUOTES_STALE_OR_INVALID');
 assert.equal(r.emailEnabled,false);assert.equal(r.writerEnabled,false);assert.equal(r.writesPerformed,false);
 assert.deepEqual(urls,['http://127.0.0.1:10000/v2/model/snapshot','http://127.0.0.1:10000/v2/swing-trading','http://127.0.0.1:10000/health']);
 const bad=await auditReadOnlySurface({port:10000,fetcher:async()=>{throw Error('secret-token')},googleProbe:async()=>({})});
 assert.equal(bad.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(bad),/secret/);
});
test('startup audit rejects mismatched HTML and cannot claim current Google data',async()=>{
 const r=await auditReadOnlySurface({port:10000,fetcher:async u=>({ok:true,json:async()=>u.endsWith('/health')?{}:feed,text:async()=>'stale HTML'}),googleProbe:async()=>({status:'BLOCKED',reason:'GOOGLE_QUOTE_SOURCE_UNAVAILABLE'})});
 assert.equal(r.status,'BLOCKED');assert.equal(r.exactHtml,false);assert.equal(r.googleSourceStatus,'SOURCE_NOT_VERIFIED');
});
