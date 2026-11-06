'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile}=require('../scripts/vixale-model-accounting-gate');
const date='2026-10-14';
const closed=[
 {ticker:'MU',entryDate:'2026-10-01',exitDate:'2026-10-10',exitTime:'10:00',reason:'TARGET',
  include:'YES',effectiveDate:'2026-10-10',realizedReturnFraction:0.1},
 {ticker:'TSM',entryDate:'2026-09-01',exitDate:'2026-10-01',exitTime:'09:30',reason:'STOP',
  include:'NO',effectiveDate:'',realizedReturnFraction:-0.4}
];
const active=[{ticker:'PLTR',entryPrice:200,currentPrice:220,currentReturnFraction:0.1}];
test('fixed 10K ignores operational shares and excluded Q=NO trade',()=>{
 const r=reconcile({asOfDate:date,active,closed});
 assert.ok(Math.abs(r.realized-1000)<0.00001);
 assert.ok(Math.abs(r.unrealized-1000)<0.00001);
 assert.ok(Math.abs(r.equity-102000)<0.00001);
 assert.equal(r.includedClosed,1);
});
test('R effective date prevents future realized P&L leaking into history',()=>{
 const x=closed.map(r=>({...r}));
 x[0].effectiveDate='2026-10-15';
 const r=reconcile({asOfDate:date,active,closed:x});
 assert.ok(Math.abs(r.realized)<0.00001);
});
test('NO trades remain in dedup despite public exclusion',()=>{
 const x=[...closed,{...closed[1]}];
 assert.throws(()=>reconcile({asOfDate:date,active,closed:x}),/duplicate closed lot/);
});
test('explicit account values must match normalized equity',()=>{
 assert.throws(()=>reconcile({asOfDate:date,active,closed,reported:{
  realized:1000,unrealized:1000,total:2000,equity:110000}}),/equity/);
});
test('stale entry or return mismatch blocks transaction',()=>{
 const x=[{...active[0],currentReturnFraction:0.3}];
 assert.throws(()=>reconcile({asOfDate:date,active:x,closed}),/return\/price discrepancy/);
});
