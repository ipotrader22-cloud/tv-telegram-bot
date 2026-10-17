'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {REQUIRED_DATES,inventory}=require('./historical-evidence-inventory.cjs');
test('all unresolved dates stay uncertified without evidence',()=>{
 const r=inventory([]);
 assert.equal(r.length,18);
 assert.deepEqual(r.map(x=>x.date),REQUIRED_DATES);
 assert.ok(r.every(x=>x.submitted===0&&!x.certified));
});
test('incomplete timestamp evidence is reported without certification',()=>{
 const r=inventory([{date:'2026-10-16',source:'signal log',lotId:'ABC'}]);
 const x=r.find(x=>x.date==='2026-10-16');
 assert.equal(x.submitted,1);assert.equal(x.completeMetadata,0);
 assert.ok(x.items[0].missing.includes('eventTimestamp'));
 assert.equal(x.certified,false);
});
test('complete metadata is not proof of parity',()=>{
 const r=inventory([{date:'2026-10-16',source:'broker',sourceId:'receipt',lotId:'ABC|2026-10-16',eventTimestamp:'2026-10-16T13:45:00-04:00',timezone:'America/New_York',markCutoffTimestamp:'2026-10-16T16:00:00-04:00'}]);
 const x=r.find(x=>x.date==='2026-10-16');
 assert.equal(x.completeMetadata,1);
 assert.equal(x.certified,false);
});
test('reject invalid timestamp syntax',()=>{
 const r=inventory([{date:'2026-10-16',source:'broker',sourceId:'receipt',lotId:'ABC',eventTimestamp:'yesterday',timezone:'ET',markCutoffTimestamp:'2026-10-16T16:00:00-04:00'}]);
 assert.ok(r.find(x=>x.date==='2026-10-16').items[0].missing.includes('INVALID_EVENT_TIMESTAMP'));
});
