'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preflight,coverage}=require('./staging-morning-readonly-preflight.cjs');
const {etTime}=require('./delayed-model-policy.cjs');
const d='2026-11-04',sourceDate='2026-11-03';
const now=new Date('2026-11-04T17:15:00Z');
function minute(i){
 const start=etTime(sourceDate,571+i),end=new Date(Date.parse(start)+60000).toISOString();
 return {start,end,provider:'GOOGLE_FINANCE_CHART',sourceId:'GOOGLE_CHART_1M:CVX:'+Date.parse(start)};
}
const bars=()=>Array.from({length:389},(_,i)=>minute(i));
function mock({health={mode:'READ_ONLY',databaseConnected:true,schemaInitialized:true,
 stagingPipeline:{enabled:false,emailEnabled:false,pricePolicy:'GOOGLE_LATEST_1000_MODEL_V1'},
 cleanSlate:{readyForProduction:false}},
 google={status:'GOOGLE_MODEL_QUOTES_OBSERVED',openingCoverage:'PASS'},
 minuteBars=bars(),dailyCount=6,feed={epoch:'2026-10-19',snapshot_date:'2026-11-02',active_portfolio:[{ticker:'CVX'}]}}={}){
 const calls=[],data={'/health':health,'/v2/model/snapshot':feed,'/v2/google-quotes/probe':google};
 return {calls,fetcher:async url=>{const path=new URL(url).pathname;calls.push(path);return {ok:true,json:async()=>data[path]};},
  provider:{
   getDailyMany:async ({tickers})=>{calls.push('daily');return tickers.slice(0,dailyCount).map(ticker=>({ticker}));},
   getMinuteHistory:async()=>{calls.push('minute');return {bars:minuteBars}}
  }};
}
test('independent Google-only model source health PASS; never requests Yahoo',async()=>{
 const m=mock(),r=await preflight({now,fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'READ_ONLY_PREFLIGHT_PASS',JSON.stringify(r));
 assert.equal(r.checks.minutes,'PASS');assert.equal(r.checks.daily,'PASS');
 assert.equal(r.checks.opening,'PASS');assert.equal(r.financialWrites,false);
 assert.deepEqual(m.calls,['/health','/v2/model/snapshot','daily','minute','/v2/google-quotes/probe']);
});
test('09:45 ET does not request unavailable opening price, but verifies yesterday',async()=>{
 const m=mock(),r=await preflight({now:new Date('2026-11-04T14:45:00Z'),
  fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'PREOPEN_GOOGLE_READY_OPENING_PENDING',JSON.stringify(r));
 assert.equal(r.checks.opening,'NOT_DUE');
 assert.ok(!m.calls.includes('/v2/google-quotes/probe'));
});
test('missing 09:31 blocks while missing 09:30 is normal',async()=>{
 assert.equal(coverage(bars(),sourceDate),true);
 assert.equal(coverage(bars().slice(1),sourceDate),false);
 const m=mock({minuteBars:bars().slice(1)});
 const r=await preflight({now,fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.minutes,'GOOGLE_MINUTE_COVERAGE_GAP');
});
test('Google daily omission or unsafe observer configuration cannot PASS',async()=>{
 for(const m of [mock({dailyCount:5}),mock({health:{mode:'LIVE'}})]){
  const r=await preflight({now,fetcher:m.fetcher,provider:m.provider});
  assert.equal(r.status,'BLOCKED');
 }
});
test('current 09:30 opening missing after 09:50 is still blocked',async()=>{
 const m=mock({google:{status:'GOOGLE_MODEL_QUOTES_OBSERVED',openingCoverage:'BLOCKED'}});
 const r=await preflight({now,fetcher:m.fetcher,provider:m.provider});
 assert.equal(r.status,'BLOCKED');assert.equal(r.checks.opening,'GOOGLE_OPEN_NOT_VERIFIED');
});
