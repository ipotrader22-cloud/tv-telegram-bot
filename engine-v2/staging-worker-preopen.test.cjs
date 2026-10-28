'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertCachedPreopen}=require('./staging-worker.cjs');
const {POLICY,hash,etTime}=require('./delayed-model-policy.cjs');
const {previousSession}=require('../scripts/swing-market-calendar');

function cached(date='2026-10-27'){
 const sourceSession=previousSession(date);
 const payload={policy:POLICY,date,sourceSession,preparedAt:etTime(date,480),
  priorHash:hash(null),batch:{date,items:[{ticker:'AMD',lastCompletedSessionDate:sourceSession}]},
  exits:[],checkedThrough:etTime(sourceSession,960)};
 return {...payload,fingerprint:hash(payload)};
}
test('cached preopen is only reusable with exact fingerprint, session, and clean predecessor',()=>{
 const date='2026-10-27',p=cached(date),now=etTime(date,500);
 assert.equal(assertCachedPreopen(p,{date,prior:null,now}),p);
 const tampered=structuredClone(p);tampered.batch.items[0].ticker='OTHER';
 assert.throws(()=>assertCachedPreopen(tampered,{date,prior:null,now}),/PREOPEN_HASH_MISMATCH/);
 assert.throws(()=>assertCachedPreopen(p,{date:'2026-10-28',prior:null,now}),/PREOPEN_IDENTITY_MISMATCH/);
 assert.throws(()=>assertCachedPreopen(p,{date,prior:{epoch:'2026-10-19',date:'2026-10-26',active:[],closed:[]},now}),/PREOPEN_IDENTITY_MISMATCH/);
 assert.throws(()=>assertCachedPreopen(p,{date,prior:null,now:etTime(date,470)}),/PREOPEN_TIME_INVALID/);
});
