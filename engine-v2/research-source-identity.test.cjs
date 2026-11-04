'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validatedResearchSource}=require('./research-source-identity.cjs');
const valid={source:'GOOGLE_FINANCE_CHART_1DAY',exchange:'NYSE',companyName:'Chevron Corporation',
 metrics:{symbol:'CVX'},rawHash:'a'.repeat(64)};
test('daily Google proof requires exact symbol/exchange/name and source hash',()=>{
 assert.match(validatedResearchSource(valid),/^GOOGLE_FINANCE_CHART_1DAY:CVX:[a-f0-9]{64}$/);
 for(const mutate of [
  v=>v.exchange='NASDAQ',v=>v.rawHash='fake',v=>v.companyName='',
  v=>v.metrics.symbol='UNKNOWN',v=>v.source='GOOGLE_FINANCE_CHART_1DAY:custom'
 ]){
  const x=structuredClone(valid);mutate(x);
  assert.equal(validatedResearchSource(x),null);
 }
});
test('legacy independent Yahoo input proof remains accepted, arbitrary URL fails',()=>{
 assert.equal(validatedResearchSource({source:'https://query1.finance.yahoo.com/v8/finance/chart/CVX',metrics:{symbol:'CVX'}}),
  'https://query1.finance.yahoo.com/v8/finance/chart/CVX');
 assert.equal(validatedResearchSource({...valid,source:'https://example.com/finance'}),null);
});
