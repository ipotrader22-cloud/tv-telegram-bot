'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {batchDossiers}=require('./historical-dossiers.cjs');
test('all 13 canonical tickers become dossiers even without market providers',async()=>{
 const result=await batchDossiers({marketTicker:'SPY',sectorMap:{}});
 assert.equal(result.mode,'HISTORICAL_SHADOW_ONLY');
 assert.equal(result.totals.tickers,13);
 assert.equal(result.totals.marketEvidenceComplete,0);
 assert.equal(result.totals.independentScoresComplete,0);
 assert.equal(result.totals.scoreMatches,0);
 assert.ok(result.dossiers.every(x=>x.reviewStatus==='INDEPENDENT_RESEARCH_INCOMPLETE'));
 assert.ok(result.comparison.every(x=>x.status==='INDEPENDENT_RESEARCH_INCOMPLETE'));
});
test('cannot silently assign sector benchmarks or accept unrelated historical date',async()=>{
 await assert.rejects(batchDossiers({reviewDate:'2026-10-13',marketTicker:'SPY',sectorMap:{}}),/Invalid canonical/);
});
test('provider failure is localized; remaining universe still covered',async()=>{
 const r=await batchDossiers({marketTicker:'SPY',sectorMap:{PLTR:'XLK'},provider:{getDailyBars:async()=>{throw Error('no dated data')}},limit:2});
 assert.equal(r.dossiers.length,2);
 assert.match(r.dossiers[0].errors[0],/MARKET_EVIDENCE_UNAVAILABLE/);
 assert.equal(r.dossiers[1].errors[0],'SECTOR_BENCHMARK_NOT_CONFIGURED');
});
