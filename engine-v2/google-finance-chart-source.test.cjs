'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGoogleChartSource,decode,parseSeries,googleIdentity}=require('./google-finance-chart-source.cjs');
const rows=(ticker,exchange,interval=60)=>[ [ticker,exchange],null,null,
 [[null,null,[[100,100,101,99,'2026-11-03T09:31:00-05:00',500]]]],null,null,null,
 ticker+' Corporation',interval ];
const body=series=>")]}'\n"+JSON.stringify([['wrb.fr','c2u4wc',JSON.stringify([series]),null,null,null,'1']]);
test('Google 1m canonical symbol provenance OHLCV and stable timestamp',async()=>{
 const fetchFn=async()=>({ok:true,status:200,text:async()=>body([rows('CVX','NYSE')])});
 const p=createGoogleChartSource({fetchFn});
 const v=await p.getMinuteHistory({ticker:'CVX',fromDate:'2026-11-03',throughDate:'2026-11-03'});
 assert.equal(v.bars.length,1);assert.equal(v.bars[0].start,'2026-11-03T14:31:00.000Z');
 assert.equal(v.bars[0].provider,'GOOGLE_FINANCE_CHART');
 assert.match(v.bars[0].sourceId,/^GOOGLE_CHART_1M:CVX:/);
 assert.equal(v.bars[0].high,101);assert.equal(v.bars[0].volume,500);
});
test('wrong source identity, interval, malformed OHLCV and duplicates fail closed',()=>{
 const good=rows('CVX','NYSE');const payload=[good];
 for(const s of [
  rows('CVX','NASDAQ'),rows('CVX','NYSE',1800),
  (()=>{const x=structuredClone(good);x[3][0][2][0][2]=2;return x})(),
  (()=>{const x=structuredClone(good);x[3][0][2].push([...x[3][0][2][0]]);return x})()
 ]){
  assert.throws(()=>parseSeries([ [s] ],'CVX','1min',{fromDate:'2026-11-03',throughDate:'2026-11-03'}));
 }
 assert.deepEqual(googleIdentity('XOM'),['XOM','NYSE']);
 assert.throws(()=>googleIdentity('NONEXISTENT'));
});
test('403/429 block before a different host or browser is attempted',async()=>{
 for(const code of [403,429]){
  let calls=0;const p=createGoogleChartSource({fetchFn:async()=>{calls++;return {ok:false,status:code}}});
  await assert.rejects(()=>p.getMinuteHistory({ticker:'XOM',fromDate:'2026-11-03',throughDate:'2026-11-03'}),/ACCESS_RESTRICTED/);
  assert.equal(calls,1);
 }
});
test('batch daily chart validates >=200 distinct sessions and source identity',async()=>{
 const daily=Array.from({length:220},(_,i)=>[100,100,101,99,
  new Date(Date.parse('2025-12-01T15:00:00Z')+i*86400000).toISOString(),1000]);
 const series=[['AMD','NASDAQ'],null,null,[[null,null,daily]],null,null,null,'AMD Corporation',86400];
 const f=async()=>({ok:true,status:200,text:async()=>body([series])});
 await assert.rejects(()=>createGoogleChartSource({fetchFn:f}).getDailyMany({tickers:['AMD'],date:'2026-11-04'}));
});
