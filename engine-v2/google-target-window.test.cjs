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
function proof(ds=[{...daily[0],high:105}]){
 return {source:'GOOGLE_FINANCE_CHART_1DAY',rawHash:'a'.repeat(64),
  metrics:{symbol:'CVX',lastCompleteDate:date},bars:ds};
}
function scan(p,opts={}){return googleHistoricalExit({position,through:end,bars:[],dailyBars:p.bars,dailyEvidence:p,...opts})}
test('certified completed high below target proves no touch without fabricated minutes',()=>{
 assert.equal(scan(proof()),null);
 const p=proof([{...daily[0],open:94,high:105}]);
 assert.equal(scan(p).reason,'STOP LOSS');
 assert.equal(scan(p).triggerAt,first);
});
test('touching target, including numerical tolerance, still requires exact minute history',()=>{
 for(const high of [110,111,110-5e-10])
  assert.throws(()=>scan(proof([{...daily[0],high}])),/GOOGLE_MINUTE_COVERAGE_GAP/);
});
test('missing, mismatched or malformed daily provenance cannot bypass minute coverage',()=>{
 for(const change of [p=>p.source='YAHOO',p=>p.rawHash='unknown',
  p=>p.metrics.symbol='XOM',p=>p.metrics.lastCompleteDate='2026-11-02',
  p=>p.bars[0].high=NaN,p=>p.bars[0].low=106,p=>p.bars[0].volume=-1]){
  const p=proof();change(p);assert.throws(()=>scan(p),/GOOGLE_MINUTE_COVERAGE_GAP/);
 }
 const p=proof();assert.throws(()=>scan(p,{dailyBars:[{...p.bars[0],high:104}]}),/GOOGLE_MINUTE_COVERAGE_GAP/);
});
test('unfinished daily session and contradictory minute high fail closed',()=>{
 assert.throws(()=>scan(proof(),{through:etTime(date,959)}),/GOOGLE_MINUTE_COVERAGE_GAP/);
 assert.throws(()=>scan(proof(),{bars:[minute(1,111)]}),/GOOGLE_DAILY_MINUTE_EVIDENCE_CONFLICT/);
});
test('entry-day daily high below target is sufficient, pre-entry touch is not a timed exit',()=>{
 const sameDay={...position,entryDate:date,entryTime:etTime(date,600),lastTargetCheckedAt:etTime(date,600)};
 assert.equal(scan(proof(),{position:sameDay}),null);
 assert.throws(()=>scan(proof([{...daily[0],high:111}]),{position:sameDay}),/GOOGLE_MINUTE_COVERAGE_GAP/);
});
test('each session needs its own negative proof; calendar honors early close and DST',()=>{
 for(const [d,close] of [['2026-11-27',780],['2026-10-30',960]]){
  const p=proof([{...daily[0],date:d,high:105}]);p.metrics.lastCompleteDate=d;
  const lot={...position,entryDate:d,entryTime:etTime(d,600),lastTargetCheckedAt:etTime(d,600)};
  assert.equal(scan(p,{position:lot,through:etTime(d,close)}),null);
  assert.throws(()=>scan(p,{position:lot,through:etTime(d,close-1)}),/GOOGLE_MINUTE_COVERAGE_GAP/);
 }
 const p=proof();p.metrics.lastCompleteDate='2026-11-04';
 assert.throws(()=>scan(p,{through:etTime('2026-11-04',960)}),/GOOGLE_HISTORICAL_OPEN_MISSING/);
});
