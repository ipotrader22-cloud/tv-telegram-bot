'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('index-scale date conversion stays below Render memory budget and preserves DST',()=>{
 const script=`
 const assert=require('node:assert/strict');
 const {localET}=require('./engine-v2/market-data-adapter.cjs');
 const {analyze}=require('./scripts/swing-daily-research-inputs.js');
 assert.deepEqual(localET('2026-11-01T05:30:00Z'),{date:'2026-11-01',minute:90});
 assert.deepEqual(localET('2026-11-01T06:30:00Z'),{date:'2026-11-01',minute:90});
 assert.deepEqual(localET('2026-03-08T06:59:00Z'),{date:'2026-03-08',minute:119});
 assert.deepEqual(localET('2026-03-08T07:00:00Z'),{date:'2026-03-08',minute:180});
 assert.deepEqual(localET('2026-11-07T04:30:00Z'),{date:'2026-11-06',minute:1410});
 const ts=Array.from({length:300},(_,i)=>Date.parse('2026-11-06T21:00:00Z')/1000-(299-i)*86400);
 const values=ts.map(()=>100),volumes=ts.map(()=>1000);
 const chart={meta:{symbol:'AAPL',regularMarketTime:ts.at(-1),regularMarketPrice:100},timestamp:ts,
 indicators:{quote:[{open:values,high:values,low:values,close:values,volume:volumes}]}};
 for(let stock=0;stock<532;stock++){
  for(const t of ts)localET(new Date(t*1000).toISOString());
  const result=analyze(chart,'2026-11-09',{completedSessionOnly:true});
  assert.equal(result.metrics.lastCompleteDate,'2026-11-06');assert.equal(result.metrics.sma200,100);
 }
 console.log(JSON.stringify({maxRSSKiB:process.resourceUsage().maxRSS}));`;
 const child=spawnSync(process.execPath,['--max-old-space-size=128','-e',script],{
  cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:40000});
 assert.equal(child.status,0,child.stderr||String(child.error));
 const {maxRSSKiB}=JSON.parse(child.stdout.trim());
 assert.ok(maxRSSKiB<192*1024,'date conversion exceeded 192 MiB RSS: '+maxRSSKiB);
});
