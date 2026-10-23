'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile}=require('./historical-score-reconcile.cjs');
test('matches only completed independently audited scores',()=>{const a=reconcile({independentReviews:[{ticker:'PLTR',reviewDate:'2026-10-12',status:'COMPLETE_ANALYST_REVIEW',score:83}],archivedReviews:[{ticker:'PLTR',reviewDate:'2026-10-12',score:83}]});assert.equal(a[0].status,'SCORE_MATCH')});
test('mismatches are explicit and never overwritten',()=>{const a=reconcile({independentReviews:[{ticker:'PLTR',reviewDate:'2026-10-12',status:'COMPLETE_ANALYST_REVIEW',score:82}],archivedReviews:[{ticker:'PLTR',reviewDate:'2026-10-12',score:83}]});assert.equal(a[0].status,'SCORE_DIFFERENCE')});
test('missing archive and pending factor research are not declared equal',()=>{const a=reconcile({independentReviews:[{ticker:'PLTR',reviewDate:'2026-10-12',status:'INCOMPLETE'},{ticker:'NVDA',reviewDate:'2026-10-12',status:'COMPLETE_ANALYST_REVIEW',score:74}],archivedReviews:[]});assert.deepEqual(a.map(x=>x.status),['INDEPENDENT_RESEARCH_INCOMPLETE','ARCHIVED_REVIEW_NOT_AVAILABLE'])});
