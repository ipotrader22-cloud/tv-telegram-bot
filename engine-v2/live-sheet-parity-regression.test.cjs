'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compareImported}=require('./live-sheet-check.cjs');
function fixture(){
 const closed=[{ticker:'ABC',entryDate:'2026-10-01',effectiveDate:'2026-10-02',includePublic:'YES',returnPct:0.02}];
 const equity=[{date:'2026-10-02',realized:200,unrealized:0,total:200,equity:10200,activeCount:1},{date:'2026-10-03',realized:200,unrealized:0,total:200,equity:10200,activeCount:1}];
 const active=[{ticker:'XYZ',entryDate:'2026-10-02',entryPrice:100,entryScore:5}];
 const base={asOf:'2026-10-03',closed,equity,active};
 return {live:structuredClone(base),stored:structuredClone(base)};
}
test('identical snapshots do not claim certified full parity',()=>{
 const {live,stored}=fixture();
 assert.equal(compareImported(live,stored).parityStatus,'UNCHANGED');
});
test('removed closed lot is detected',()=>{
 const {live,stored}=fixture();stored.closed.push({ticker:'OLD',entryDate:'2026-09-01',returnPct:0});
 const result=compareImported(live,stored);
 assert.equal(result.closedRemoved,1);assert.equal(result.parityStatus,'DRIFT');
});
test('active membership change is detected',()=>{
 const {live,stored}=fixture();live.active[0].ticker='OTHER';
 assert.equal(compareImported(live,stored).activeChanged,true);
});
test('frozen historical equity mutation is detected',()=>{
 const {live,stored}=fixture();live.equity[0].unrealized=17;
 assert.equal(compareImported(live,stored).frozenChanged,true);
});
test('missing prior active and equity arrays remain supported',()=>{
 const {live,stored}=fixture();delete stored.active;delete stored.equity;
 assert.equal(compareImported(live,stored).parityStatus,'DRIFT');
});
test('incorrect realized accounting fails closed',()=>{
 const {live,stored}=fixture();live.equity[1].realized=199;
 assert.throws(()=>compareImported(live,stored),/reconciliation/);
});
