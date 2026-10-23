'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replay,parseMoney}=require('./replay.cjs');
test('preserves Q=NO soft-excluded rows in dedup, excludes their PnL',()=>{
 const closed=[{ticker:'A',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:'$100.00',exitPrice:'$110.00',reason:'TARGET',includePublic:'YES',effectiveDate:'2026-10-02'},{ticker:'B',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:'$100.00',exitPrice:'$90.00',reason:'STOP LOSS',includePublic:'NO',effectiveDate:'2026-10-02'}];
 const r=replay({closed,asOf:'2026-10-02'});
 assert.equal(r.closedCount,2);assert.equal(r.excludedCount,1);assert.ok(Math.abs(r.realized-1000)<1e-7);
 assert.throws(()=>replay({closed:[...closed,closed[1]],asOf:'2026-10-02'}),/Duplicate/);
});
test('Q/R effective date gates realized PnL',()=>{
 const c=[{ticker:'C',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:100,exitPrice:105,includePublic:'YES',effectiveDate:'2026-10-16'}];
 assert.equal(replay({closed:c,asOf:'2026-10-02'}).realized,0);
 assert.ok(Math.abs(replay({closed:c,asOf:'2026-10-16'}).realized-500)<1e-7);
});
test('frozen equity not silently overwritten',()=>{
 const r=replay({closed:[],active:[{ticker:'A',entryDate:'2026-10-01',entryPrice:100,price:101}],equity:[{date:'2026-10-16',equity:'$100,000.00',time:'10:00 ET'}],asOf:'2026-10-16'});
 assert.equal(r.marks[0].equity,100000);assert.equal(r.warnings[0].gate,'VALUATION_TIME_MISMATCH');
});
test('accounting parser supports parentheses',()=>{assert.equal(parseMoney('($163.85)'),-163.85)});
