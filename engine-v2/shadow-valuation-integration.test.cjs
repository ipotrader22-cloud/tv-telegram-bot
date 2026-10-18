'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectPayload}=require('./shadow-compare.cjs');
const {fromRanges,compareImported}=require('./live-sheet-check.cjs');
const closed=[{ticker:'TEST',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:10,exitPrice:11,returnPct:0.1,includePublic:'YES',effectiveDate:'2026-10-02'}];
const equity=[{date:'2026-10-02',realized:1000,unrealized:0,total:1000,equity:101000,activeCount:0}];
test('shadow replay output exposes blocking missing quote even when realized accounting passes',()=>{
 const p=inspectPayload({closed,equity,asOf:'2026-10-02',active:[{ticker:'LIVE',entryDate:'2026-10-02',entryPrice:100,shares:10,price:null}]});
 assert.equal(p.realized.status,'PASS');assert.equal(p.valuation.status,'BLOCKED');assert.equal(p.valuation.marketValue,null);
});
test('entry mutation signals review independently of valuation',()=>{
 const lot={ticker:'LIVE',entryDate:'2026-10-02',entryPrice:100,shares:10,price:101};
 const p=inspectPayload({closed,equity,asOf:'2026-10-02',active:[lot],previousActive:[{...lot,entryPrice:99}]});
 assert.equal(p.valuation.status,'PASS');assert.equal(p.entryIntegrity.status,'REVIEW_REQUIRED');
});
test('canonical Sheet parser retains shares and cost basis for valid shadow valuation',()=>{
 const got=fromRanges([
  {values:[['2026-10-02','10:00 ET','TEST','NASDAQ','2026-10-01',10,100,1000,11,1100,100,0.1,'YES','TARGET','','','YES','2026-10-02']]},
  {values:[['2026-10-02','10:00 ET',1000,10,1010,101010,1]]},
  {values:[['2026-10-02','NASDAQ','LIVE',80,'Active Portfolio',100,10,1000,101,1010,10,0.01,0.1,'2026-10-02']]}
 ]);
 assert.equal(got.active[0].shares,10);assert.equal(got.active[0].costBasis,1000);
});
