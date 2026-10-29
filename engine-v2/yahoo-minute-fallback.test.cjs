'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {completedBars,quoteFromBars,openingFromBars,targetFromBars,createYahooMinuteProvider}=require('./yahoo-minute-fallback.cjs');
const d='2026-10-22',at='2026-10-22T10:00:00-04:00';
const ts=['2026-10-22T09:30:00-04:00','2026-10-22T09:58:00-04:00','2026-10-22T09:59:00-04:00'].map(x=>Date.parse(x)/1000);
const raw={chart:{result:[{meta:{symbol:'AMD'},timestamp:ts,indicators:{quote:[{open:[100,101,102],high:[101,103,104],low:[99,100,101],close:[100,102,103],volume:[500,600,700]}]}}]}};
const bars=completedBars(raw,{ticker:'AMD',date:d,asOf:at});
test('quotes are explicitly indicative bar closes, not trade fills',()=>{const x=quoteFromBars(bars,{ticker:'AMD',date:d,at});assert.equal(x.status,'REFERENCE_MARK');assert.equal(x.price,103);assert.equal(x.modelFill,false);assert.equal(x.indicative,true)});
test('reject source 15-minute stale even when Yahoo returns positive price',()=>{const x=quoteFromBars(bars,{ticker:'AMD',date:d,at:'2026-10-22T10:15:00-04:00'});assert.equal(x.status,'BLOCKED')});
test('9:30 opening from dated completed bar only',()=>{const x=openingFromBars(bars,{ticker:'AMD',date:d});assert.equal(x.open,100);assert.equal(x.indicative,true)});
test('target high comes from post-entry completed minutes only',()=>{const x=targetFromBars(bars,{ticker:'AMD',date:d,entryTime:'2026-10-22T09:58:00-04:00',at});assert.equal(x.high,104)});
test('no post-entry bar never silently infers target',()=>assert.equal(targetFromBars(bars,{ticker:'AMD',date:d,entryTime:'2026-10-22T10:00:00-04:00',at}).status,'BLOCKED'));
test('provider fetch is read-only and never connects to IBKR',async()=>{const adapter=createYahooMinuteProvider({fetchFn:async url=>{assert.match(url,/query1\.finance\.yahoo\.com/);return {ok:true,json:async()=>raw}}});const x=await adapter.getQuotes({date:d,runAt:at,tickers:['AMD']});assert.equal(x[0].priceKind,'MINUTE_BAR_CLOSE')});

test('rejects duplicate Yahoo minute timestamps rather than silently sorting conflicting marks',()=>{
 const x=structuredClone(raw),q=x.chart.result[0].indicators.quote[0];
 x.chart.result[0].timestamp.push(ts[2]);
 for(const k of ['open','high','low','close','volume'])q[k].push(q[k][2]+1);
 assert.throws(()=>completedBars(x,{ticker:'AMD',date:d,asOf:at}),/TIMESTAMP_SEQUENCE_INVALID/);
});
test('rejects reversed or non-minute-aligned timestamps',()=>{
 const reversed=structuredClone(raw);
 reversed.chart.result[0].timestamp=[ts[1],ts[0],ts[2]];
 assert.throws(()=>completedBars(reversed,{ticker:'AMD',date:d,asOf:at}),/TIMESTAMP_SEQUENCE_INVALID/);
 const misaligned=structuredClone(raw);
 misaligned.chart.result[0].timestamp[1]+=30;
 assert.throws(()=>completedBars(misaligned,{ticker:'AMD',date:d,asOf:at}),/TIMESTAMP_SEQUENCE_INVALID/);
});
test('rejects incomplete OHLCV vectors instead of using unpaired prices',()=>{
 const x=structuredClone(raw);
 x.chart.result[0].indicators.quote[0].volume.pop();
 assert.throws(()=>completedBars(x,{ticker:'AMD',date:d,asOf:at}),/OHLCV_LENGTH_MISMATCH/);
});

function withLiveTail(){
 const x=structuredClone(raw),c=x.chart.result[0];
 c.meta.dataGranularity='1m';c.meta.regularMarketTime=ts[2]+10;
 c.timestamp.push(c.meta.regularMarketTime);
 for(const k of ['open','high','low','close'])c.indicators.quote[0][k].push(104);
 c.indicators.quote[0].volume.push(0);return x;
}
test('Yahoo zero-volume live tail is excluded, never rounded into a minute',()=>{
 const x=withLiveTail();
 assert.deepEqual(completedBars(x,{ticker:'AMD',date:d,asOf:at}),bars);
 // Even a later read cannot turn this live quote into historical bar evidence.
 assert.deepEqual(completedBars(x,{ticker:'AMD',date:d,asOf:d+'T18:00:00Z'}),bars);
});
test('only the exact trailing live-quote signature is excluded',()=>{
 for(const mutate of [
  c=>c.meta.regularMarketTime++,c=>c.meta.dataGranularity='5m',
  c=>c.indicators.quote[0].volume[3]=1,c=>c.indicators.quote[0].high[3]=105,
  c=>{c.timestamp[3]+=60;c.meta.regularMarketTime+=60;},
  c=>{c.timestamp[1]+=10;}
 ]){
  const x=withLiveTail();mutate(x.chart.result[0]);
  assert.throws(()=>completedBars(x,{ticker:'AMD',date:d,asOf:at}),/TIMESTAMP_SEQUENCE_INVALID/);
 }
});
test('live tail cannot supply the required 09:40 close',()=>{
 const {fixedQuote}=require('./delayed-model-policy.cjs');
 const x=withLiveTail(),c=x.chart.result[0];
 c.timestamp=[ts[0],ts[0]+480,ts[0]+600,ts[0]+610];
 c.meta.regularMarketTime=c.timestamp[3];
 const parsed=completedBars(x,{ticker:'AMD',date:d,asOf:at});
 assert.throws(()=>fixedQuote(parsed,{ticker:'AMD',date:d,fetchedAt:at}),/EXACT_0940_BAR_REQUIRED/);
});

test('real Yahoo shape with null current-minute slot preserves exact fixed quote',()=>{
 const {fixedQuote}=require('./delayed-model-policy.cjs');
 const x=withLiveTail(),c=x.chart.result[0],q=c.indicators.quote[0];
 c.timestamp=[ts[0],ts[0]+540,ts[2],ts[2]+10];
 for(const k of ['open','high','low','close','volume'])q[k][2]=null;
 const parsed=completedBars(x,{ticker:'AMD',date:d,asOf:at});
 const mark=fixedQuote(parsed,{ticker:'AMD',date:d,fetchedAt:at});
 assert.equal(mark.timestamp,d+'T13:40:00.000Z');assert.equal(mark.price,102);
 assert.equal(parsed.length,2);
});
