'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {morningAuditSlot,createMorningDbAuditMonitor}=require('./staging-db-monitor.cjs');
test('observer schedules read-only verification after 10:00 with NY DST and NYSE calendar',()=>{
 assert.equal(morningAuditSlot('2026-11-03T15:05:00Z'),'2026-11-03');
 assert.equal(morningAuditSlot('2026-10-23T14:05:00Z'),'2026-10-23');
 assert.equal(morningAuditSlot('2026-11-03T14:05:00Z'),null);
 assert.equal(morningAuditSlot('2026-11-03T15:04:00Z'),null);
 assert.equal(morningAuditSlot('2026-11-03T15:26:00Z'),null);
 assert.equal(morningAuditSlot('2026-11-26T15:05:00Z'),null);
 assert.equal(morningAuditSlot('2029-11-05T15:05:00Z'),null);
});
test('observer logs one receipt per immutable snapshot or meaningful failure transition, never writes',async()=>{
 const logs=[];let calls=0,answer={status:'BLOCKED',reason:'SESSION_JOURNAL_CARDINALITY_MISMATCH',writesPerformed:false};
 const monitor=createMorningDbAuditMonitor({url:'shadow',clock:()=>new Date('2026-11-03T15:05:15Z'),
  audit:async()=>{calls++;return answer},log:(...s)=>logs.push(s)});
 await monitor();await monitor();assert.equal(logs.length,1);
 answer={status:'PASS',snapshotId:'fingerprint-a',carriedOpeningEvidenceCount:2,writesPerformed:false};
 await monitor();assert.equal(logs.length,2);
 await monitor();assert.equal(logs.length,2);assert.equal(calls,4);
 answer={...answer,snapshotId:'fingerprint-b'};
 await monitor();assert.equal(logs.length,3);
 assert.match(logs[1].join(' '),/carriedOpeningEvidenceCount/);
});
test('provider exception sanitizes secrets and does not suppress another attempt',async()=>{
 let throwNow=true,logs=[];
 const monitor=createMorningDbAuditMonitor({url:'shadow',clock:()=>new Date('2026-11-03T15:10:00Z'),
  audit:async()=>{if(throwNow)throw Error('sensitive-db-url');return {status:'PASS',snapshotId:'ok',writesPerformed:false}},
  log:(...v)=>logs.push(v.join(' '))});
 assert.equal((await monitor()).reason,'STAGING_READ_ONLY_AUDIT_UNAVAILABLE');
 assert.doesNotMatch(logs.join(' '),/sensitive-db-url/);
 throwNow=false;assert.equal((await monitor()).status,'PASS');assert.equal(logs.length,2);
});
