'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditSnapshots}=require('./snapshot-audit.cjs');
const mark=(date,count)=>({date,realized:200,unrealized:0,total:200,equity:100200,activeCount:count});
test('frozen formulas and fully known membership can pass',()=>{
 const r=auditSnapshots({closed:[],active:[],marks:[mark('2026-10-02',0)],asOf:'2026-10-02'});
 assert.equal(r.status,'PASS');
});
test('same-day opening remains unverified without intraday timestamps',()=>{
 const r=auditSnapshots({closed:[],active:[{ticker:'ABC',entryDate:'2026-10-02'}],marks:[mark('2026-10-02',1)],asOf:'2026-10-02'});
 assert.equal(r.status,'PARTIAL');
 assert.ok(r.unverified.some(x=>x.gate==='INTRADAY_MEMBERSHIP_TIMING_NOT_RECONSTRUCTIBLE'));
});
test('historical formula mismatch must not certify',()=>{
 const m=mark('2026-10-02',0);m.equity+=5;
 const r=auditSnapshots({closed:[],active:[],marks:[m],asOf:'2026-10-02'});
 assert.equal(r.status,'FAIL');
 assert.ok(r.errors.some(x=>x.issues.includes('EQUITY_FORMULA')));
});
test('missing numeric frozen mark stays unverified',()=>{
 const m=mark('2026-10-02',0);m.unrealized=null;
 const r=auditSnapshots({closed:[],active:[],marks:[m],asOf:'2026-10-02'});
 assert.equal(r.status,'PARTIAL');
 assert.ok(r.unverified.some(x=>x.gate==='MISSING_NUMERIC_FROZEN_MARK'));
});
test('unexplained membership discrepancy stays unverified',()=>{
 const r=auditSnapshots({closed:[],active:[],marks:[mark('2026-10-02',2)],asOf:'2026-10-02'});
 assert.equal(r.status,'PARTIAL');
 assert.ok(r.unverified.some(x=>x.gate==='MEMBERSHIP_SOURCE_INCOMPLETE'));
});
