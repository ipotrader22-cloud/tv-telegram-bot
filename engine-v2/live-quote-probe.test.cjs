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

test('delayed source can certify exact 09:30 opening while five-minute latest-mark gate is stale',async()=>{
 const t='2026-11-04T15:00:00Z',d='2026-11-04';
 const first=new Date('2026-11-04T14:30:00Z').toISOString();
 const x=await checkMinuteFeed({at:t,provider:{getBars:async()=>({bars:[{
  ticker:'SPY',date:d,start:first,end:'2026-11-04T14:31:00Z',
  open:500,close:501,sourceId:'YAHOO_1M:SPY:'+Date.parse(first),
  provider:'YAHOO_CHART',volume:100
 }]})}});
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.reason,'FALLBACK_REFERENCE_MARK_STALE');
 assert.equal(x.openingBarObserved,true);
 assert.equal(x.openingAsOf,first);
 assert.equal(x.tradeEvidenceVerified,false);
 assert.equal(x.modelEntryEligible,false);
});
test('opening evidence not certified before 09:50 or without exact 09:30 bar',async()=>{
 const d='2026-11-04',s='2026-11-04T14:31:00Z';
 const provider={getBars:async()=>({bars:[{ticker:'SPY',date:d,start:s,
  end:'2026-11-04T14:32:00Z',close:500,provider:'YAHOO_CHART',
  sourceId:'YAHOO_1M:SPY:'+Date.parse(s),volume:100}]})};
 const early=await checkMinuteFeed({at:'2026-11-04T14:49:00Z',provider});
 const later=await checkMinuteFeed({at:'2026-11-04T15:00:00Z',provider});
 assert.equal(early.openingBarObserved,false);
 assert.equal(later.openingBarObserved,false);
 assert.equal(later.modelEntryEligible,false);
});
test('new fixed upstream diagnostic categories never include provider secrets',async()=>{
 for(const [error,code] of [['YAHOO_MINUTE_DATA_TIMEOUT','REQUEST_TIMEOUT'],
  ['YAHOO_MINUTE_DATA_TRANSPORT','TRANSPORT_FAILURE'],
  ['YAHOO_MINUTE_DATA_INVALID_JSON','INVALID_JSON']]){
  const result=await checkMinuteFeed({at,provider:{getBars:async()=>{throw Error(error)}}});
  assert.equal(result.sourceFailure,code);
  assert.doesNotMatch(JSON.stringify(result),/http:|token|api_key/);
 }
});
