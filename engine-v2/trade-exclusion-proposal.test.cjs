'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeExclusions}=require('./trade-exclusion-proposal.cjs');
const closed=[{ticker:'AMD',entryDate:'2026-09-21',exitDate:'2026-10-08'}],active=[{ticker:'PLTR',entryDate:'2026-10-01'}];
test('aggregate equity discrepancy does not identify a trade',()=>{const r=proposeExclusions({closed,active,discrepancies:[{reason:'Oct 7 valuation changed',confirmed:true,evidenceIds:['revision-241']}]});assert.equal(r.excludedCount,0);assert.equal(r.blocked.length,1);});
test('confirmed, attributable discrepancy produces non-mutating exclusion proposal',()=>{const r=proposeExclusions({closed,active,discrepancies:[{lotId:'AMD|2026-09-21',reason:'Confirmed duplicate',confirmed:true,evidenceIds:['revision-241','revision-278']}]});assert.equal(r.excludedCount,1);assert.equal(r.closed.length,0);assert.equal(r.active.length,1);assert.equal(closed.length,1);assert.equal(r.certified,false)});
test('unconfirmed or evidence-free records are retained',()=>{const r=proposeExclusions({closed,active,discrepancies:[{lotId:'AMD|2026-09-21',reason:'suspect',confirmed:false,evidenceIds:['rev']},{lotId:'PLTR|2026-10-01',reason:'suspect',confirmed:true}]});assert.equal(r.excludedCount,0)});
test('duplicate lot keys fail closed',()=>assert.throws(()=>proposeExclusions({closed:[...closed,...closed]}),/duplicate/i));
