'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fetchSymbol}=require('../scripts/vixale-research-ohlcv');
test('collector tries backup source then blocks without fabricating OHLCV',async()=>{
 let calls=[];
 const request=async url=>{calls.push(url);return {ok:false,status:502}};
 await assert.rejects(()=>fetchSymbol('PLTR','2026-10-14',request),
    /OHLCV PLTR unavailable/);
 assert.equal(calls.length,4);
 assert.equal(calls.filter(x=>x.includes('query1.finance.yahoo.com')).length,2);
 assert.equal(calls.filter(x=>x.includes('query2.finance.yahoo.com')).length,2);
});
test('invalid response schema blocks rather than inventing quotes',async()=>{
 const request=async()=>({ok:true,json:async()=>({chart:{result:[{meta:{regularMarketTime:1}}]}})});
 await assert.rejects(()=>fetchSymbol('PLTR','2026-10-14',request),/unavailable/);
});
