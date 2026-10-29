'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkMinuteFeed}=require('./live-quote-probe.cjs');
const date='2026-10-22',at='2026-10-22T10:00:00-04:00';
test('read-only real-minute probe distinguishes market evidence from position eligibility',async()=>{
 const x=await checkMinuteFeed({at,provider:{getBars:async()=>({bars:[
 {ticker:'SPY',date,start:'2026-10-22T09:59:00-04:00',end:'2026-10-22T10:00:00-04:00',close:500,sourceId:'yahoo-1m',provider:'YAHOO_CHART',volume:100}
 ]})}});
 assert.equal(x.status,'INDICATIVE_MINUTE_FEED_OBSERVED');assert.equal(x.tradeEvidenceVerified,false);assert.equal(x.modelEntryEligible,false)
});
test('provider outage blocks rather than inventing data',async()=>{
 const x=await checkMinuteFeed({at,provider:{getBars:async()=>{throw Error('offline')}}});
 assert.equal(x.status,'BLOCKED');assert.equal(x.reason,'OHLCV_PROVIDER_UNAVAILABLE');
});
test('stale bar blocks even if positive reference mark exists',async()=>{
 const x=await checkMinuteFeed({at,provider:{getBars:async()=>({bars:[
 {ticker:'SPY',date,start:'2026-10-22T09:40:00-04:00',end:'2026-10-22T09:41:00-04:00',close:500,sourceId:'old',provider:'YAHOO_CHART',volume:100}
 ]})}});
 assert.equal(x.status,'BLOCKED');
});

test('provider diagnostics expose only fixed safe categories',async()=>{
 for(const [message,name,expected] of [
  ['YAHOO_MINUTE_DATA_HTTP_429','Error','RATE_LIMITED'],
  ['YAHOO_MINUTE_DATA_HTTP_403','Error','ACCESS_DENIED'],
  ['YAHOO_MINUTE_TIMESTAMP_SEQUENCE_INVALID','Error','INVALID_MINUTE_SEQUENCE'],
  ['INVALID_YAHOO_CHART','Error','INVALID_CHART'],
  ['private URL and credentials','TimeoutError','REQUEST_TIMEOUT'],
  ['private JSON payload','SyntaxError','INVALID_JSON'],
  ['secret-token-123','Error','UNCLASSIFIED_PROVIDER_FAILURE'],
  ['YAHOO_MINUTE_DATA_HTTP_429 secret-token-123','Error','UNCLASSIFIED_PROVIDER_FAILURE']
 ]){
  const result=await checkMinuteFeed({at,provider:{getBars:async()=>{const e=Error(message);e.name=name;throw e;}}});
  assert.equal(result.sourceFailure,expected);assert.equal(result.status,'BLOCKED');
  assert.equal(result.modelEntryEligible,false);assert.equal(result.tradeEvidenceVerified,false);
  assert.doesNotMatch(JSON.stringify(result),/secret-token|private/);
 }
});
