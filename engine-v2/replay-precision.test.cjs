'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replay}=require('./replay.cjs');
test('full precision return overrides visually rounded exit price',()=>{
 const r=replay({closed:[{ticker:'MU',entryDate:'2026-09-23',exitDate:'2026-10-12',entryPrice:1090.27,exitPrice:997.63,returnPct:-0.08496977812835349,includePublic:'YES',effectiveDate:'2026-10-12'}],asOf:'2026-10-16'});
 assert.ok(Math.abs(r.realized-(-849.6977812835349))<0.0000001);
 assert.equal(r.warnings.some(x=>x.gate==='MISSING_STORED_RETURN'),false);
});
test('missing stored return produces auditable warning',()=>{
 const r=replay({closed:[{ticker:'A',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:100,exitPrice:110,includePublic:'YES',effectiveDate:'2026-10-02'}],asOf:'2026-10-16'});
 assert.equal(r.warnings[0].gate,'MISSING_STORED_RETURN');
});
test('missing effective date cannot silently enter public accounting',()=>{
 assert.throws(()=>replay({closed:[{ticker:'A',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:100,exitPrice:110,returnPct:0.1,includePublic:'YES'}],asOf:'2026-10-16'}),/effective date/);
});
