'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditAll}=require('./replay-all.cjs');
const close={ticker:'PLTR',entryDate:'2026-10-01',exitDate:'2026-10-02',entryPrice:100,exitPrice:110,returnPct:0.1,includePublic:'YES',effectiveDate:'2026-10-02'};
test('all dates pass with canonical L and R',()=>{
 const x=auditAll({closed:[close],equity:[{date:'2026-10-01',realized:0},{date:'2026-10-02',realized:1000},{date:'2026-10-03',realized:1000}]});
 assert.equal(x.status,'PASS');assert.equal(x.dates,3);assert.equal(x.scope,'REALIZED_PNL_ONLY');
});
test('mismatched earlier day blocks full replay',()=>{
 const x=auditAll({closed:[close],equity:[{date:'2026-10-01',realized:55},{date:'2026-10-02',realized:1000}]});
 assert.equal(x.status,'BLOCKED');assert.equal(x.failed.length,1);
});
test('missing original return forbids price-based historical fabrication',()=>{
 assert.throws(()=>auditAll({closed:[{...close,returnPct:undefined}],equity:[{date:'2026-10-02',realized:1000}]}),/raw L/);
});
