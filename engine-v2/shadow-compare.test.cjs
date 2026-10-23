'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {inspectPayload}=require('./shadow-compare.cjs');
test('stored snapshot audit distinguishes historical source from live Sheet',()=>{
 const p={asOf:'2026-10-16',closed:[],active:[{ticker:'A',entryDate:'2026-10-01'}],equity:[{date:'2026-10-16',realized:0,unrealized:100,total:100,equity:100100,activeCount:1}]};
 const r=inspectPayload(p);assert.equal(r.realized.status,'PASS');assert.equal(r.frozen.status,'PASS');assert.equal(r.source,'IMPORTED_SNAPSHOT_NOT_LIVE');
});
test('inconsistent frozen unrealized mark is not counted as success',()=>{
 const p={asOf:'2026-10-16',closed:[],active:[],equity:[{date:'2026-10-16',realized:0,unrealized:20,total:0,equity:100000,activeCount:0}]};
 assert.equal(inspectPayload(p).frozen.status,'FAIL');
});