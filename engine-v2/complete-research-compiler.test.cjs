'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CAPS}=require('./core.cjs');
const {compileFullResearch}=require('./complete-research-compiler.cjs');
const date='2026-10-22',runAt='2026-10-22T10:00:00-04:00';
const metrics=s=>({symbol:s,quoteDate:date,dailyBars:250,lastCompleteDate:'2026-10-21',
 sma20:100,sma50:90,sma200:80,lastCompleteRelativeVolume:1.2,
 range20Pct:15,high20:120,high60:123,return20Pct:5,return60Pct:10,
 quoteTime:'2026-10-22T09:59:00-04:00',price:110});
const syms=['AMD','SPY','QQQ','SMH','XLK','XLE'];
const artifact={gate:'RESEARCH_INPUTS',result:'PASS',date,collectedAt:runAt,
 data:syms.map(s=>({source:'https://query1.finance.yahoo.com/v8/finance/chart/'+s,metrics:metrics(s)}))};
const factors=Object.fromEntries(Object.entries(CAPS).map(([k,points])=>[k,
 {points,sourceId:'source-'+k,checkedAt:'2026-10-22T09:57:00-04:00',explanation:'Verified dated factual evidence for '+k}]));
const assessment={ticker:'AMD',reviewDate:date,reviewTime:'2026-10-22T09:58:00-04:00',
 complete:true,factors,score:100,entryEligible:true,entryEvidenceId:'technical-setup-1'};
const newsReview={date,complete:true,checkedAt:'2026-10-22T09:59:00-04:00',
 sourceId:'archived-news-review-20261022',tickers:['AMD']};
const args={artifact,date,runAt,session:{date,isTradingDay:true,providerVerified:true},universe:['AMD'],assessments:[assessment],newsReview};
test('nine complete dated weighted assessments produce a certified batch without invented points',()=>{
 const r=compileFullResearch(args);assert.equal(r.status,'PASS');assert.equal(r.batch.items[0].score,100);
 assert.equal(r.batch.items[0].entryEligible,true);
});
test('missing qualitative news check rejects entire batch',()=>assert.equal(compileFullResearch({...args,newsReview:null}).status,'BLOCKED'));
test('missing factor proof blocks despite numeric score',()=>{
 const r=compileFullResearch({...args,assessments:[{...assessment,factors:{...factors,catalyst:{points:10}}}]});
 assert.equal(r.status,'BLOCKED');
});
test('cannot assign score by summing unstated factors',()=>assert.equal(compileFullResearch({...args,assessments:[{...assessment,score:99}]}).status,'BLOCKED'));
test('no arbitrarily duplicated research universe',()=>assert.equal(compileFullResearch({...args,universe:['AMD','AMD']}).status,'BLOCKED'));
