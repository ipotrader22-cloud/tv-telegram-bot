"use strict";
const assert=require("node:assert/strict");
const {session,previousSession}=require("../scripts/swing-market-calendar");
const {analyze}=require("../scripts/swing-daily-research-inputs");
assert.equal(session("2026-10-13").open,true);
assert.equal(session("2026-10-12").open,true); // Columbus Day is not an equity holiday.
assert.equal(session("2026-07-03").open,false);
assert.equal(session("2026-11-27").closeEt,"13:00");
assert.equal(session("2027-12-31").open,true); // No Friday substitution for Saturday New Year.
assert.equal(previousSession("2026-10-12"),"2026-10-09");
assert.throws(()=>session("2029-01-02"),/needs maintenance/);
const timestamps=[]; let d=new Date("2026-10-09T13:30:00Z");
while(timestamps.length<210){if(d.getUTCDay()!==0&&d.getUTCDay()!==6)timestamps.unshift(d.getTime()/1000);d.setUTCDate(d.getUTCDate()-1);}
timestamps.push(new Date("2026-10-12T13:30:00Z").getTime()/1000);
const chart={meta:{symbol:"TEST",regularMarketTime:new Date("2026-10-12T17:00:00Z").getTime()/1000,regularMarketPrice:102},timestamp:timestamps,
 indicators:{quote:[{open:timestamps.map(()=>100),high:timestamps.map(()=>103),low:timestamps.map(()=>99),close:timestamps.map((_,i)=>i===210?500:100),volume:timestamps.map((_,i)=>i===210?2:1000)}]}};
const result=analyze(chart,"2026-10-12");
assert.equal(result.metrics.sma20,100); // Today's partial bar cannot contaminate completed-bar averages.
assert.equal(result.metrics.lastCompleteRelativeVolume,1);
assert.equal(result.metrics.dailyBars,210);
const stale=JSON.parse(JSON.stringify(chart));stale.meta.regularMarketTime-=86400;
assert.throws(()=>analyze(stale,"2026-10-12"),/today/);
const missing=JSON.parse(JSON.stringify(chart));missing.timestamp.splice(-2,1);
assert.throws(()=>analyze(missing,"2026-10-12"),/completed-session/);
console.log("Swing dated research inputs and NYSE calendar: PASS");

