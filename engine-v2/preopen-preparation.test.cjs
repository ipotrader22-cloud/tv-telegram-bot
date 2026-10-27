'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparePreopen}=require('./preopen-preparation.cjs');
const {analyze}=require('../scripts/swing-daily-research-inputs');
const {previousSession}=require('../scripts/swing-market-calendar');
const {validatePrepared,etTime}=require('./delayed-model-policy.cjs');

// Provider boundary fixture includes yesterday's regular quote, as real Yahoo
// responses do before opening. Exercise the real collector, scorer and validator.
function chart(ticker,date){
 const timestamps=[];let day=previousSession(date);
 while(timestamps.length<200){timestamps.unshift(Date.parse(day+'T14:30:00Z')/1000);if(timestamps.length<200)day=previousSession(day)}
 const closes=timestamps.map((_,i)=>100+i*.1+Math.sin(i)*2);
 return {meta:{symbol:ticker,exchangeName:'NMS',longName:ticker+' Corporation',
  regularMarketTime:Date.parse(previousSession(date)+'T20:00:00Z')/1000,regularMarketPrice:closes.at(-1)},
  timestamp:timestamps,indicators:{quote:[{open:closes,close:closes,high:closes.map(x=>x+1),low:closes.map(x=>x-1),volume:closes.map(()=>1000)}]}};
}
function fixture(date,mutate=()=>{}){
 const at=date+'T12:00:00Z';let requests=0;
 return {get requests(){return requests},args:{date,clock:()=>new Date(at),getPrior:async()=>null,
  env:{VIXALE_V2_RESEARCH_UNIVERSE:'AMD',VIXALE_V2_RESEARCH_SECTORS_JSON:'{"AMD":"SMH"}'},
  fetchFn:async source=>{
   requests++;const u=new URL(source);
   if(u.hostname==='news.google.com')return {ok:true,text:async()=>'<rss><channel></channel></rss>'};
   assert.equal(u.hostname,'query1.finance.yahoo.com');
   assert.equal(u.searchParams.get('interval'),'1d');
   const c=chart(u.pathname.split('/').at(-1),date);mutate(c);
   return {ok:true,json:async()=>({chart:{result:[c]}})};
  }
 }};
}
test('pre-open real pipeline accepts prior-session quotes and preserves source dates',async()=>{
 for(const date of ['2026-10-27','2026-10-26','2026-11-27']){
  const f=fixture(date),p=await preparePreopen(f.args);
  assert.equal(p.sourceSession,previousSession(date));
  assert.equal(p.batch.items.length,1);assert.equal(Object.keys(p.batch.items[0].factors).length,9);
  assert.equal(p.batch.items[0].completedDailyBars,200);assert.equal(p.exits.length,0);
  for(const {metrics:m} of p.batch.sourceEvidence.artifact.data){
   assert.equal(m.researchDate,date);assert.equal(m.quoteDate,previousSession(date));
   assert.equal(m.lastCompleteDate,previousSession(date));assert.equal(m.todayChangePct,null);
  }
  validatePrepared(p,{date,previous:null,now:f.args.clock().toISOString()});
  assert.equal(f.requests,7); // Six OHLCV sources plus news; no intraday quote needed.
 }
});
test('legacy intraday collector still rejects prior-session quotes',()=>{
 const date='2026-10-27',c=chart('AMD',date);
 assert.throws(()=>analyze(c,date),/today's session/);
 c.meta.regularMarketTime=Date.parse(date+'T14:00:00Z')/1000;
 assert.equal(analyze(c,date).metrics.quoteDate,date);
});
test('pre-open preparation still blocks stale stock or benchmark history and short history',async()=>{
 for(const ticker of ['AMD','SPY']){
  const f=fixture('2026-10-27',c=>{if(c.meta.symbol===ticker)c.timestamp.pop()});
  await assert.rejects(()=>preparePreopen(f.args),/completed-session history/);
 }
 const f=fixture('2026-10-27',c=>c.timestamp.splice(0,20));
 await assert.rejects(()=>preparePreopen(f.args),/completed-session history/);
});
test('pre-open scoring ignores current partial bars and current quote changes',async()=>{
 const date='2026-10-27',baseline=await preparePreopen(fixture(date).args);
 const f=fixture(date,c=>{
  c.meta.regularMarketPrice=999999;
  c.timestamp.push(Date.parse(date+'T13:30:00Z')/1000);
  for(const values of Object.values(c.indicators.quote[0]))values.push(999999);
 });
 const p=await preparePreopen(f.args);
 assert.deepEqual(p.batch.items[0].factors,baseline.batch.items[0].factors);
 assert.equal(p.batch.items[0].ma200,baseline.batch.items[0].ma200);
});
test('preparation at opening is rejected before any source request',async()=>{
 const f=fixture('2026-10-27');f.args.clock=()=>new Date(etTime(f.args.date,570));
 await assert.rejects(()=>preparePreopen(f.args),/OUTSIDE_PREOPEN_WINDOW/);
 assert.equal(f.requests,0);
});
