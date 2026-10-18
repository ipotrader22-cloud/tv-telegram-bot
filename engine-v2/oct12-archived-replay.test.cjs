'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replayArchived}=require('./oct12-archived-replay.cjs');
const day=i=>new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
const bars=Array.from({length:200},(_,i)=>({date:day(i),open:100,high:102,low:99,close:101,volume:100000}));
test('13 canonical records retained despite entirely missing archive symbols',()=>{
 const x=replayArchived({date:'2026-10-12',data:[]});
 assert.equal(x.covered,13);assert.equal(x.quantitativeComplete,0);
 assert.equal(x.independentScoresComplete,0);
 assert.ok(x.dossiers.every(y=>y.independentScore===null&&y.scoreMatch===null));
});
test('duplicate market input cannot overwrite original ticker',()=>assert.throws(()=>replayArchived({date:'2026-10-12',data:[{metrics:{symbol:'PLTR'},bars},{metrics:{symbol:'PLTR'},bars}]}),/duplicated/));
test('historical cutoff rejects stale 200-bar fixture',()=>assert.throws(()=>replayArchived({date:'2026-10-12',data:[{metrics:{symbol:'PLTR'},bars}]}),/completed bars/));
test('wrong archive date rejected',()=>assert.throws(()=>replayArchived({date:'2026-10-13',data:[]}),/Unexpected/));
