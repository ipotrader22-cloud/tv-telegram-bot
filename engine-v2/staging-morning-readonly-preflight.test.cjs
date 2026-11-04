'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preflight,safeProviderFailure}=require('./staging-morning-readonly-preflight.cjs');
const d='2026-11-04',now=new Date('2026-11-04T17:15:00Z');
const opening='2026-11-04T14:30:00.000Z';
const openingBar={ticker:'CVX',date:d,start:opening,end:'2026-11-04T14:31:00.000Z',
 open:200,close:201,high:202,low:199,volume:100,
 sourceId:'YAHOO_1M:CVX:'+Date.parse(opening),provider:'YAHOO_CHART'};
function mock({yahoo={openingBarObserved:true},google={status:'GOOGLE_MODEL_QUOTES_OBSERVED'},feed={epoch:'2026-10-19',snapshot_date:'2026-11-02',active_portfolio:[{ticker:'CVX'}]},health={mode:'READ_ONLY',databaseConnected:true,schemaInitialized:true,stagingPipeline:{enabled:false,emailEnabled:false,pricePolicy:'GOOGLE_LATEST_1000_MODEL_V1'},cleanSlate:{readyForProduction:false}},bars=[openingBar]}={}){
 const paths=[],data={'/health':health,'/v2/model/snapshot':feed,
  '/v2/market-data/probe':yahoo,'/v2/google-quotes/probe':google};
 return {paths,fetcher:async url=>{const p=new URL(url).pathname;paths.push(p);
  return {ok:true,json:async()=>data[p]};},
  provider:{getBars:async()=>({bars})}};
}
test('historical 09:30 proof, live Google and Render egress pass without writes',async()=>{
 const m=mock(),r=await preflight({now,fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'READ_ONLY_PREFLIGHT_PASS',JSON.stringify(r));
 assert.equal(r.checks.heldOpeningSource,'PASS');
 assert.equal(r.checks.renderYahoo,'PASS');assert.equal(r.checks.google,'PASS');
 assert.equal(r.readOnly,true);assert.equal(r.financialWrites,false);
 assert.deepEqual(m.paths,['/health','/v2/model/snapshot','/v2/market-data/probe','/v2/google-quotes/probe']);
});
test('missing exact opening or inaccessible Render quote source blocks',async()=>{
 const badOpening=mock({bars:[{...openingBar,start:'2026-11-04T14:31:00Z'}]});
 assert.equal((await preflight({now,fetcher:badOpening.fetcher,provider:badOpening.provider})).status,'BLOCKED');
 const badRender=mock({yahoo:{status:'BLOCKED',sourceFailure:'RATE_LIMITED'}});
 const r=await preflight({now,fetcher:badRender.fetcher,provider:badRender.provider});
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.renderYahoo,'RATE_LIMITED');
});
test('Google price missing and unsafe observer configuration cannot pass',async()=>{
 const g=mock({google:{status:'BLOCKED',reason:'GOOGLE_QUOTE_STALE_OR_INVALID'}});
 assert.equal((await preflight({now,fetcher:g.fetcher,provider:g.provider})).status,'BLOCKED');
 const h=mock({health:{mode:'LIVE'}});
 const r=await preflight({now,fetcher:h.fetcher,provider:h.provider});
 assert.equal(r.reason,'SHADOW_SAFETY_OR_CONFIGURATION');assert.equal(r.status,'BLOCKED');
});
test('before delayed opening availability does not query live providers',async()=>{
 const m=mock(),r=await preflight({now:new Date('2026-11-04T14:45:00Z'),
  fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'BEFORE_DELAYED_OPEN_RELEASE');
 assert.deepEqual(m.paths,['/health','/v2/model/snapshot']);
});
test('provider failures are emitted as fixed public-safe categories only',()=>{
 for(const s of ['http://private.example/token','YAHOO_MINUTE_DATA_HTTP_429 private key']){
  const reason=safeProviderFailure(Error(s));
  assert.equal(reason,'YAHOO_UNCLASSIFIED_FAILURE');
  assert.doesNotMatch(reason,/private|token/);
 }
 assert.equal(safeProviderFailure(Error('YAHOO_MINUTE_DATA_HTTP_429')),'YAHOO_RATE_LIMITED');
});
