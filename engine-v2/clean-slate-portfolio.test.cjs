'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initializeEpoch,prepareDailyReview,buildDailySnapshot}=require('./clean-slate-portfolio.cjs');
test('new epoch starts with no inherited holdings and 100k model capital',()=>{const x=initializeEpoch();assert.equal(x.active.length,0);assert.equal(x.capital,100000);assert.equal(x.historicalImported,false)});
test('old trades are rejected from clean slate',()=>assert.throws(()=>initializeEpoch({existingPositions:[{ticker:'AMD'}]}),/legacy/));
test('missing nine factor research or quotes blocks a publishable result',()=>{const x=buildDailySnapshot({date:'2026-10-19'});assert.equal(x.status,'BLOCKED');assert.equal(x.publishable,false)});
test('market session must be confirmed',()=>assert.equal(prepareDailyReview({date:'2026-10-19',positions:[],researchComplete:true,quoteEvidenceComplete:true,marketSessionConfirmed:false}).status,'BLOCKED'));
test('validated zero-trade day yields a legitimate flat starting portfolio',()=>{const x=buildDailySnapshot({date:'2026-10-19',positions:[],closed:[],researchComplete:true,quoteEvidenceComplete:true,marketSessionConfirmed:true});assert.equal(x.status,'VALIDATED_NOT_PUBLISHED');assert.equal(x.equity,100000);assert.equal(x.active,0)});
test('legacy active lot blocked even when validly scored',()=>{const factors={market:10,sector:15,leadership:15,catalyst:10,base:15,compression:10,volume:15,ma:5,resistance:5};assert.throws(()=>buildDailySnapshot({date:'2026-10-19',positions:[{ticker:'AMD',entryDate:'2026-10-08',entryPrice:100,currentPrice:101,currentScore:100,factors,fullReviewDate:'2026-10-19'}],researchComplete:true,quoteEvidenceComplete:true,marketSessionConfirmed:true}),/Legacy/);});
