'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {googleHistoricalExit}=require('./google-target-window.cjs');
const {etTime}=require('./delayed-model-policy.cjs');
const date='2026-11-03';
const first=etTime(date,570),end=etTime(date,960);
const position={ticker:'CVX',entryDate:'2026-11-02',entryTime:'2026-11-02T15:00:00Z',
 lastTargetCheckedAt:'2026-11-03T14:30:00.000Z',entryPrice:100};
function minute(offset=1,price=101){
 const t=Date.parse(first)+offset*60000;
 return {ticker:'CVX',date,start:new Date(t).toISOString(),end:new Date(t+60000).toISOString(),
  open:100,high:price,low:99,close:100,volume:1000,provider:'GOOGLE_FINANCE_CHART',
  sourceId:'GOOGLE_CHART_1M:CVX:'+t+':fixture'};
}
function bars(){return Array.from({length:389},(_,i)=>minute(i+1));}
const daily=[{date,open:100,high:111,low:93,close:101,volume:1e6}];
test('09:31 through 15:59 complete scan allows missing 09:30 1m and no invented exit',()=>{
 assert.equal(googleHistoricalExit({position,through:end,bars:bars(),dailyBars:daily}),null);
});
test('historical DAILY session OPEN independently triggers STOP even though 09:30 1m missing',()=>{
 const e=googleHistoricalExit({position,through:end,bars:bars(),dailyBars:[{...daily[0],open:94}]});
 assert.equal(e.reason,'STOP LOSS');
 assert.equal(e.triggerAt,first);
 assert.equal(e.triggerPriceKind,'DAILY_SESSION_OPEN');
});
test('earliest verified TARGET from 09:31 highs triggers with exact minute end',()=>{
 const b=bars();b[1]={...b[1],high:111};
 const e=googleHistoricalExit({position,through:end,bars:b,dailyBars:daily});
 assert.equal(e.reason,'TARGET');assert.equal(e.triggerAt,etTime(date,573));
});
test('09:30 minute evidence is ignored for target proof and cannot substitute 09:31',()=>{
 const extra=minute(0,200),b=bars().slice(1);
 assert.throws(()=>googleHistoricalExit({position,through:end,bars:[extra,...b],dailyBars:daily}),/GOOGLE_MINUTE_COVERAGE_GAP/);
});
test('corrupted or duplicate required minute blocks before acting on possible target',()=>{
 const b=bars();b[1]={...b[1],high:111};
 for(const mutate of [x=>x.splice(40,1),x=>x.push(x[80]),x=>x[0].sourceId='unverified']){
  const data=structuredClone(b);mutate(data);
  assert.throws(()=>googleHistoricalExit({position,through:end,bars:data,dailyBars:daily}),/GOOGLE_/);
 }
});
test('future or orphaned position and absent daily opening are blocked safely',()=>{
 assert.throws(()=>googleHistoricalExit({position:{...position,entryTime:'bad'},through:end,bars:bars(),dailyBars:daily}),/TARGET_POSITION/);
 assert.throws(()=>googleHistoricalExit({position,through:end,bars:bars(),dailyBars:[]}),/GOOGLE_HISTORICAL_OPEN_MISSING/);
});
