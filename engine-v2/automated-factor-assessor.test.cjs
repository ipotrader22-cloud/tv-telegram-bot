'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {autoAssess}=require('./automated-factor-assessor.cjs');
const {CAPS}=require('./core.cjs');
const date='2026-10-22',runAt='2026-10-22T10:00:00-04:00';
const symbols=['AMD','SPY','QQQ','SMH','XLK','XLE'];
const m=s=>({symbol:s,quoteDate:date,dailyBars:250,lastCompleteDate:'2026-10-21',
 lastCompleteClose:110,sma20:105,sma50:100,sma200:90,lastCompleteRelativeVolume:1.4,
 upDownVolume20:1.8,range5Pct:7,range20Pct:15,high20:112,high60:120,return20Pct:12,return60Pct:30,
 quoteTime:'2026-10-22T09:59:00-04:00',price:112});
const artifact={gate:'RESEARCH_INPUTS',result:'PASS',date,data:symbols.map(s=>({
 source:'https://query1.finance.yahoo.com/v8/finance/chart/'+s,metrics:m(s)
}))};
const news={date,complete:true,status:'COVERAGE_COMPLETE_SCORING_PENDING',sourceId:'source:news',tickers:['AMD']};
test('all nine factors supported, catalyst conservatively zero without substantive verification',()=>{
 const x=autoAssess({artifact,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:news});
 assert.equal(x.status,'DETERMINISTIC_NINE_FACTOR_ASSESSMENTS');
 const a=x.assessments[0];assert.equal(Object.keys(a.factors).length,9);
 assert.equal(a.factors.catalyst.points,0);
 const total=Object.values(a.factors).reduce((n,f)=>n+f.points,0);assert.equal(total,a.score);
 for(const [name,cap] of Object.entries(CAPS))assert.ok(a.factors[name].points<=cap);
});
test('missing sector or actual completed volume blocks assessment',()=>{
 const x=autoAssess({artifact,date,runAt,universe:['AMD'],sectorByTicker:{},newsReview:news});
 assert.equal(x.status,'BLOCKED');
 const corrupted=JSON.parse(JSON.stringify(artifact));corrupted.data[0].metrics.upDownVolume20=null;
 const y=autoAssess({artifact:corrupted,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:news});
 assert.equal(y.status,'BLOCKED');
});
test('mere news headline count never fabricates catalyst points',()=>{
 const x=autoAssess({artifact,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},
 newsReview:{...news,articlesCount:10000}});
 assert.equal(x.assessments[0].factors.catalyst.points,0);
});

test('rejects stale, future and unsupported benchmark sessions before assigning any points',()=>{
 for(const mutation of [
  row=>{row.metrics.lastCompleteDate='2026-10-20'},
  row=>{row.metrics.lastCompleteDate='2026-10-22'},
  row=>{row.metrics.quoteDate='2026-10-21'},
  row=>{row.metrics.return20Pct=null},
  row=>{row.metrics.dailyBars=100},
  row=>{row.source='https://example.invalid/spy'}
 ]){
  const bad=structuredClone(artifact);mutation(bad.data.find(x=>x.metrics.symbol==='SPY'));
  const x=autoAssess({artifact:bad,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:news});
  assert.equal(x.status,'BLOCKED');assert.match(x.reason,/BENCHMARK_SESSION_OR_SOURCE_UNVERIFIED/);
  assert.equal(x.complete,false);
 }
 const duplicate=structuredClone(artifact);duplicate.data.push(structuredClone(duplicate.data.find(x=>x.metrics.symbol==='SPY')));
 assert.equal(autoAssess({artifact:duplicate,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:news}).status,'BLOCKED');
});
test('candidate and benchmark research must agree with previous NYSE session, including Monday',()=>{
 const bad=structuredClone(artifact);bad.data[0].metrics.lastCompleteDate='2026-10-20';
 assert.equal(autoAssess({artifact:bad,date,runAt,universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:news}).reason,'CANDIDATE_COMPLETED_SESSION_MISMATCH');
 const monday='2026-10-26',a=structuredClone(artifact);
 a.date=monday;
 for(const row of a.data){row.metrics.quoteDate=monday;row.metrics.lastCompleteDate='2026-10-23'}
 const x=autoAssess({artifact:a,date:monday,runAt:'2026-10-26T10:00:00-04:00',universe:['AMD'],sectorByTicker:{AMD:'SMH'},newsReview:{...news,date:monday}});
 assert.equal(x.status,'DETERMINISTIC_NINE_FACTOR_ASSESSMENTS');
});
