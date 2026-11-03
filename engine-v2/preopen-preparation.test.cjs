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

test('preopen exit scan never mistakes intraday low for opening stop',()=>{
 const {exitEvidence}=require('./preopen-preparation.cjs');
 const through='2026-10-23T13:33:00Z';
 const position={ticker:'AMD',entryDate:'2026-10-22',entryTime:'2026-10-22T14:00:00Z',
  entryPrice:100,lastTargetCheckedAt:'2026-10-23T13:30:00Z'};
 const raw=bars=>({chart:{result:[{meta:{symbol:'AMD'},timestamp:bars.map((_,i)=>Date.parse('2026-10-23T13:30:00Z')/1000+i*60),
  indicators:{quote:[{open:bars.map(b=>b[0]),high:bars.map(b=>b[1]),low:bars.map(b=>b[2]),
   close:bars.map(b=>b[3]),volume:bars.map(()=>1000)}]}}]}});
 const normal=[[100,101,94,100],[100,102,91,100],[100,103,95,101]];
 assert.equal(exitEvidence(raw(normal),{position,through}),null,
  'neither opening-minute low nor later intraday low is an opening STOP');
 const openingStop=[[94,100,93,95],...normal.slice(1)];
 const stop=exitEvidence(raw(openingStop),{position,through});
 assert.equal(stop.reason,'STOP LOSS');
 assert.equal(stop.triggerAt,'2026-10-23T13:30:00.000Z');
 assert.equal(stop.triggerPriceKind,'MINUTE_BAR_OPEN');
 const target=exitEvidence(raw([normal[0],[100,111,91,100],normal[2]]),{position,through});
 assert.equal(target.reason,'TARGET');
 assert.equal(target.triggerPriceKind,'MINUTE_BAR_HIGH');
 assert.equal(target.triggerAt,'2026-10-23T13:32:00.000Z');
 const both=exitEvidence(raw([[94,111,93,95],...normal.slice(1)]),{position,through});
 assert.equal(both.reason,'STOP LOSS');
 assert.equal(both.ambiguousSameBar,true);
 assert.equal(exitEvidence(raw(openingStop),{position:{...position,entryDate:'2026-10-23',entryTime:'2026-10-23T13:30:00Z'},through}),null,
  'a lot entered today cannot be treated as held at the opening');
});


test('Nov 3 preopen handles two Nov 2 carried positions with complete source-backed minute coverage',async()=>{
 const date='2026-11-03',sourceSession='2026-11-02',at='2026-11-03T12:07:00Z';
 const previous={epoch:'2026-10-19',date:sourceSession,
  active:['AMD','NVDA'].map(ticker=>({ticker,entryDate:sourceSession,
   entryTime:'2026-11-02T15:00:00Z',lastTargetCheckedAt:'2026-11-02T15:00:00Z',
   entryPrice:100,exchange:'NASDAQ'})),closed:[],history:[]};
 const calls={daily:0,minute:0,news:0};
 const fetchFn=async source=>{
  const u=new URL(source);
  if(u.hostname==='news.google.com'){
   calls.news++;return {ok:true,text:async()=>'<rss><channel></channel></rss>'};
  }
  assert.equal(u.hostname,'query1.finance.yahoo.com');
  const ticker=u.pathname.split('/').at(-1);
  if(u.searchParams.get('interval')==='1d'){
   calls.daily++;return {ok:true,json:async()=>({chart:{result:[chart(ticker,date)]}})};
  }
  assert.equal(u.searchParams.get('interval'),'1m');
  calls.minute++;
  assert.equal(u.searchParams.get('period1'),String(Date.parse('2026-11-02T14:59:00Z')/1000));
  assert.equal(u.searchParams.get('period2'),String(Date.parse('2026-11-02T21:00:00Z')/1000));
  // A 09:59 bar (before the 10:00 model lot) must never trigger a TARGET.
  // The extra minute is fetched only to make Yahoo return the real 10:00 bar.
  const stamps=Array.from({length:361},(_,i)=>Date.parse('2026-11-02T14:59:00Z')/1000+i*60);
  const raw={chart:{result:[{meta:{symbol:ticker,dataGranularity:'1m'},
   timestamp:stamps,indicators:{quote:[{open:stamps.map(()=>100),
    high:stamps.map((_,i)=>i===0?120:100.5),low:stamps.map(()=>99.5),
    close:stamps.map(()=>100),volume:stamps.map(()=>1000)}]}}]}};
  return {ok:true,json:async()=>raw};
 };
 const p=await preparePreopen({date,clock:()=>new Date(at),getPrior:async()=>previous,
  env:{VIXALE_V2_RESEARCH_UNIVERSE:'AMD,NVDA',
   VIXALE_V2_RESEARCH_SECTORS_JSON:JSON.stringify({AMD:'SMH',NVDA:'SMH'})},
  fetchFn});
 validatePrepared(p,{date,previous,now:at});
 assert.equal(p.sourceSession,sourceSession);
 assert.equal(p.checkedThrough,'2026-11-02T21:00:00.000Z');
 assert.equal(p.batch.items.length,2);
 assert.deepEqual(calls,{daily:7,minute:2,news:2});
 assert.equal(p.exits.some(x=>x.reason==='TARGET'||x.reason==='STOP LOSS'),false);
});

test('Nov 3 carried-lot preopen blocks a missing minute rather than silently ignoring target coverage',async()=>{
 const {exitEvidence}=require('./preopen-preparation.cjs');
 const position={ticker:'NVDA',entryDate:'2026-11-02',entryTime:'2026-11-02T15:00:00Z',
  lastTargetCheckedAt:'2026-11-02T15:00:00Z',entryPrice:100};
 const stamps=Array.from({length:360},(_,i)=>Date.parse('2026-11-02T15:00:00Z')/1000+i*60)
  .filter((_,i)=>i!==77);
 const raw={chart:{result:[{meta:{symbol:'NVDA'},timestamp:stamps,
  indicators:{quote:[{open:stamps.map(()=>100),high:stamps.map(()=>100.5),
   low:stamps.map(()=>99.5),close:stamps.map(()=>100),volume:stamps.map(()=>1000)}]}}]}};
 assert.throws(()=>exitEvidence(raw,{position,through:'2026-11-02T21:00:00.000Z'}),
  /TARGET_MINUTE_COVERAGE_GAP/);
});


test('preopen reports a redacted ledger-read stage, never the underlying connection error',async()=>{
 const f=fixture('2026-11-03');let fetches=0;
 f.args.getPrior=async()=>{throw Error('postgres credentials secret URI')};
 f.args.fetchFn=async()=>{fetches++;throw Error('must not fetch')};
 await assert.rejects(()=>preparePreopen(f.args),e=>e.message==='PREOPEN_LEDGER_READ_FAILED');
 assert.equal(fetches,0);
});
test('preopen reports a redacted research-collection stage without touching carried-minute history',async()=>{
 const f=fixture('2026-11-03');let fetches=0;
 f.args.fetchFn=async()=>{fetches++;throw Error('private Yahoo credential URL')};
 await assert.rejects(()=>preparePreopen(f.args),e=>e.message==='PREOPEN_RESEARCH_COLLECTION_FAILED');
 assert.equal(fetches,4); // First parallel Yahoo batch only; no ledger or minute update.
});
test('preopen keeps a known research HTTP status safely distinguishable',async()=>{
 const f=fixture('2026-11-03');
 f.args.fetchFn=async()=>({ok:false,status:429});
 await assert.rejects(()=>preparePreopen(f.args),e=>e.message==='RESEARCH_OHLCV_HTTP_429');
});
test('preopen labels opaque carried minute source failures after successful independent research',async()=>{
 const f=fixture('2026-11-03');
 f.args.getPrior=async()=>({epoch:'2026-10-19',date:'2026-11-02',closed:[],history:[],
  active:[{ticker:'AMD',exchange:'NASDAQ',entryDate:'2026-11-02',
   entryTime:'2026-11-02T15:00:00Z',lastTargetCheckedAt:'2026-11-02T15:00:00Z',entryPrice:100}]});
 await assert.rejects(()=>preparePreopen(f.args),e=>e.message==='PREOPEN_CARRIED_MINUTE_EVIDENCE_FAILED');
});


test('failed real RSS coverage stays fail-closed with a known research source code',async()=>{
 const f=fixture('2026-11-03'),original=f.args.fetchFn;
 f.args.fetchFn=async url=>new URL(url).hostname==='news.google.com'
  ?{ok:false,status:503}:original(url);
 await assert.rejects(()=>preparePreopen(f.args),e=>e.message==='NEWS_COVERAGE_FAILED');
 assert.equal(f.requests,6); // Yahoo completed-session history, no carried-minute or model commit.
});
