'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CAPS,factors,workbook,reviewSet}=require('../scripts/vixale-review-evidence-gate');
const names=Object.keys(CAPS),asOfDate='2026-10-13';
function review(ticker='PLTR'){
 const scores=Object.fromEntries(names.map(name=>[name,CAPS[name]]));
 return {ticker,score:100,reviewDate:'2026-10-14',factors:scores,
  evidence:Object.fromEntries(names.map(name=>[name,{
   asOfDate, sources:['https://example.org/private/'+name],
   rationale:'Independently reviewed dated price and company evidence'}])),
  marketEvidence:{lastCompletedSession:asOfDate,completedDailyBars:250,
    exchangeVolume:true,sma20:100,sma50:95,sma200:90,relativePerformance:0.1,relativeVolume:1.2},
  sourceArtifact:'sha256:research-test'};
}
const empty={portfolio:[],openPositions:[],publicActive:[],candidates:[],closedTrades:[],
 formulas:{cashPct:true,closedSpill:true,equityHistoryProtected:true}};
test('full nine factor score with private evidence',()=>assert.equal(factors(review()),100));
test('reject missing evidence even with correct public score',()=>{
 const x=review();delete x.evidence.Volume;
 assert.throws(()=>factors(x),/Volume needs dated private sources/);
});
test('reject invented exchange volume from social activity',()=>{
 const x=review();x.marketEvidence.exchangeVolume=false;
 assert.throws(()=>factors(x),/Exchange volume/);
});
test('reject score mismatch and component over cap',()=>{
 const x=review();x.score=99;
 assert.throws(()=>factors(x),/must equal/);
 x.score=100;x.factors.Market=11;
 assert.throws(()=>factors(x),/Market score outside/);
});
test('membership must match in Portfolio/Open/Public',()=>{
 const x=structuredClone(empty);x.openPositions=[{ticker:'PLTR',status:'Active Portfolio',entryDate:'2026-10-08',entryScore:85,entryPrice:200}];
 assert.throws(()=>workbook(x),/membership mismatch/);
});
test('Q/R effective date and protected formulas gate',()=>{
 const x=structuredClone(empty);x.closedTrades=[{ticker:'ABC',entryDate:'2026-09-01',exitDate:'2026-09-03',exitTime:'10:00 ET',reason:'TARGET',include:'YES',effectiveDate:''}];
 assert.throws(()=>workbook(x),/effective date/);
 x.closedTrades=[];x.formulas.closedSpill=false;
 assert.throws(()=>workbook(x),/spill/);
});
test('all active and candidates must have actual daily reassessment',()=>{
 const x=structuredClone(empty);x.candidates=[{ticker:'PLTR'}];
 assert.throws(()=>reviewSet(x,[],'2026-10-14'),/membership mismatch/);
 assert.deepEqual(reviewSet(x,[review()],'2026-10-14'),{count:1,active:0,date:'2026-10-14'});
});
