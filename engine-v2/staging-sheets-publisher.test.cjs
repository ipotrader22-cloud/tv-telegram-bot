'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nextEquityRow,writePrivateStaging}=require('./staging-sheets-publisher.cjs');
test('choose first available clean-epoch equity history row after inception',()=>{
 assert.deepEqual(nextEquityRow([{values:[['2026-10-19']]}],'2026-10-22'),{status:'READY',rowIndex:2});
});
test('no backdating or inherited legacy equity dates',()=>{
 assert.throws(()=>nextEquityRow([{values:[['2026-08-21']]}],'2026-10-22'),/INCEPTION/);
 assert.throws(()=>nextEquityRow([{values:[['2026-10-19'],['2026-10-22']]}],'2026-10-21'),/BACKDATED/);
});
test('feature disabled by default, no access to API',async()=>{
 let count=0;
 const api={spreadsheets:{batchUpdate:async()=>{count++}}};
 const x=await writePrivateStaging({api});
 assert.equal(x.status,'BLOCKED');assert.equal(count,0);
});
test('never claim public website parity merely from staging batch',async()=>{
 const x=await writePrivateStaging({enabled:'YES',api:{}});
 assert.equal(x.status,'BLOCKED');assert.equal(x.published,false);
});
