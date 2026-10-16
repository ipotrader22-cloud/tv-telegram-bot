'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditSnapshots}=require('./snapshot-audit.cjs');
const base={closed:[],active:[{ticker:'PLTR',entryDate:'2026-10-08'}],marks:[{date:'2026-10-16',realized:-163.84588122176135,unrealized:-313.8387964531242,total:-477.6846776748855,equity:99522.31532232511,activeCount:1}],asOf:'2026-10-16'};
test('frozen history accounting and known membership PASS',()=>{const r=auditSnapshots(base);assert.equal(r.status,'PASS');assert.equal(r.reports[0].minimum,1)});
test('detects destructive rewriting of frozen mark',()=>{const r=auditSnapshots({...base,marks:[{...base.marks[0],unrealized:400}]});assert.equal(r.status,'FAIL');assert.ok(r.errors[0].issues.includes('TOTAL_FORMULA'))});
test('same-day entries are not falsely treated as known precise membership',()=>{const r=auditSnapshots({...base,active:[{ticker:'PLTR',entryDate:'2026-10-16'}]});assert.equal(r.status,'PARTIAL');assert.equal(r.unverified[0].gate,'INTRADAY_MEMBERSHIP_TIMING_NOT_RECONSTRUCTIBLE')});
test('impossible active count is rejected',()=>{const r=auditSnapshots({...base,marks:[{...base.marks[0],activeCount:5}]});assert.equal(r.status,'FAIL')});
