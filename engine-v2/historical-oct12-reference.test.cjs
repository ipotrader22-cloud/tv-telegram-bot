'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reference}=require('./historical-oct12-reference.cjs');
const {reconcile}=require('./historical-score-reconcile.cjs');
test('canonical October 12 historical sample has all thirteen recorded reviews',()=>{assert.equal(reference.length,13);assert.equal(reference.filter(x=>x.status==='ACTIVE').length,3);assert.equal(reference.filter(x=>x.status==='CANDIDATE').length,5);assert.equal(reference.filter(x=>x.status==='SCORE_EXIT').length,5)});
test('archived portfolio alone never qualifies as independently recreated research',()=>{const actual=reconcile({independentReviews:reference.map(x=>({ticker:x.ticker,reviewDate:x.reviewDate,status:'INCOMPLETE'})),archivedReviews:reference});assert.equal(actual.length,13);assert.ok(actual.every(x=>x.status==='INDEPENDENT_RESEARCH_INCOMPLETE'))});
