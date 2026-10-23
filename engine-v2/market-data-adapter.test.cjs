'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateQuote,fetchVerifiedQuote}=require('./market-data-adapter.cjs');
const at='2026-10-19T10:00:00-04:00';
const quote={ticker:'NVDA',price:200,timestamp:'2026-10-19T09:59:20-04:00',sourceId:'trade-203',provider:'exchange-vendor',verified:true,session:'REGULAR',exchangeVolume:100};
test('validated contemporaneous trade carries timestamp and source id',()=>assert.equal(validateQuote({ticker:'NVDA',quote,at,date:'2026-10-19'}).status,'PASS'));
test('stale quote is blocked',()=>assert.equal(validateQuote({ticker:'NVDA',quote:{...quote,timestamp:'2026-10-19T09:52:00-04:00'},at,date:'2026-10-19'}).status,'BLOCKED'));
test('premarket quote is blocked',()=>assert.equal(validateQuote({ticker:'NVDA',quote:{...quote,timestamp:'2026-10-19T09:29:59-04:00'},at,date:'2026-10-19',maxAgeMs:3600000}).reason,'NOT_REGULAR_SESSION_ET'));
test('zero trading volume rejected',()=>assert.equal(validateQuote({ticker:'NVDA',quote:{...quote,exchangeVolume:0},at,date:'2026-10-19'}).status,'BLOCKED'));
test('provider adapter never invents data',async()=>assert.rejects(()=>fetchVerifiedQuote({ticker:'NVDA',at,date:'2026-10-19'})));

test('owner-authorized indicative Yahoo minute close validates only when explicitly enabled',()=>{
 const {validateModelReference}=require('./market-data-adapter.cjs');
 const a={ticker:'NVDA',price:200,sourceId:'YAHOO_1M:NVDA:timestamp',provider:'YAHOO_CHART',
 timestamp:'2026-10-19T09:59:00-04:00',session:'REGULAR',verified:true,exchangeVolume:200,
 priceKind:'MINUTE_BAR_CLOSE',indicative:true,delayed:true,modelFill:false};
 const denied=validateModelReference({ticker:'NVDA',quote:a,at:'2026-10-19T10:00:00-04:00',date:'2026-10-19'});
 assert.equal(denied.status,'BLOCKED');
 const accepted=validateModelReference({ticker:'NVDA',quote:a,at:'2026-10-19T10:00:00-04:00',date:'2026-10-19',allowIndicativeFallback:true});
 assert.equal(accepted.status,'INDICATIVE_REFERENCE_VALIDATED');assert.equal(accepted.indicative,true);assert.equal(accepted.modelFill,false);
});
test('fallback may never masquerade as real-time LAST',()=>{
 const {validateModelReference}=require('./market-data-adapter.cjs');
 const a={ticker:'NVDA',price:200,sourceId:'YAHOO_1M:x',provider:'YAHOO_CHART',
 timestamp:'2026-10-19T09:59:00-04:00',session:'REGULAR',verified:true,exchangeVolume:200,
 priceKind:'LAST_TRADE',indicative:true,delayed:true,modelFill:false};
 assert.equal(validateModelReference({ticker:'NVDA',quote:a,at:'2026-10-19T10:00:00-04:00',date:'2026-10-19',allowIndicativeFallback:true}).status,'BLOCKED');
});
