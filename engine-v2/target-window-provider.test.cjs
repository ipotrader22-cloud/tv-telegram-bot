'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyTargetWindow}=require('./target-window-provider.cjs');
const {localET}=require('./market-data-adapter.cjs');
const position={ticker:'TEST',entryPrice:100,entryTime:'2026-10-21T14:00:00Z',lastTargetCheckedAt:'2026-10-21T14:00:00Z'};
const runAt='2026-10-22T14:00:00Z';
function raw(){
 const timestamp=[],q={open:[],high:[],low:[],close:[],volume:[]};
 for(let t=Date.parse(position.entryTime);t<Date.parse(runAt);t+=60000){const et=localET(new Date(t).toISOString());if(et.minute<570||et.minute>=960)continue;
  timestamp.push(t/1000);q.open.push(100);q.high.push(t===Date.parse('2026-10-21T19:00:00Z')?111:101);q.low.push(99);q.close.push(100);q.volume.push(1000);
 }return {chart:{result:[{meta:{symbol:'TEST'},timestamp,indicators:{quote:[q]}}]}};
}
test('detect target yesterday afternoon, preserving first touch and complete watermark',()=>{
 const x=verifyTargetWindow(raw(),{position,runAt});assert.equal(x.high,111);assert.equal(x.time,'2026-10-21T19:01:00.000Z');assert.equal(x.checkedThrough,runAt.replace('Z','.000Z'));assert.equal(x.completeCoverage,true);
});
test('one missing minute invalidates the complete target scan',()=>{const r=raw();r.chart.result[0].indicators.quote[0].high[3]=null;assert.throws(()=>verifyTargetWindow(r,{position,runAt}),/COVERAGE_GAP/)});
test('history outside seven-day retrieval cannot silently omit old target evidence',()=>assert.throws(()=>verifyTargetWindow(raw(),{position:{...position,lastTargetCheckedAt:'2026-10-10T14:00:00Z'},runAt}),/OUTSIDE/));
