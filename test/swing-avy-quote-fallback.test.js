'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {yahooMinuteQuote,project}=require('../lib/swing-intraday-valuation');
const now=new Date('2026-11-16T15:32:00Z');
const stamp=Math.floor(Date.parse('2026-11-16T15:30:00Z')/1000);
function fetcher(meta={},quote={}){
 return async()=>({ok:true,json:async()=>({chart:{result:[{
  meta:{symbol:'AVY',exchangeName:'NYQ',currency:'USD',...meta},
  timestamp:[stamp],indicators:{quote:[{close:[325.5],volume:[1200],...quote}]}
 }]}})});
}
test('AVY fallback accepts a completed current-session NYSE minute bar',async()=>{
 const q=await yahooMinuteQuote({ticker:'AVY',exchange:'NYSE',now,fetcher:fetcher()});
 assert.equal(q.price,325.5);
 assert.equal(q.source,'YAHOO_CHART_1M');
 assert.equal(q.timestamp,'2026-11-16T15:31:00.000Z');
});
test('fallback rejects mismatched symbol or exchange',async()=>{
 await assert.rejects(yahooMinuteQuote({ticker:'AVY',exchange:'NYSE',now,fetcher:fetcher({symbol:'AAPL'})}),/IDENTITY_UNVERIFIED/);
 await assert.rejects(yahooMinuteQuote({ticker:'AVY',exchange:'NYSE',now,fetcher:fetcher({exchangeName:'NMS'})}),/IDENTITY_UNVERIFIED/);
});
test('fallback rejects empty, stale, or zero-volume evidence',async()=>{
 assert.equal(await yahooMinuteQuote({ticker:'AVY',exchange:'NYSE',now,fetcher:fetcher({}, {volume:[0]})}),null);
 assert.equal(await yahooMinuteQuote({ticker:'AVY',exchange:'NYSE',now:new Date('2026-11-16T15:50:00Z'),fetcher:fetcher()}),null);
});
test('missing AVY mark keeps aggregate model P&L withheld',()=>{
 const snapshot={available:true,active_count:1,active_portfolio:[{ticker:'AVY',entry_price:'$320',entry_date:'2026-11-16'}]};
 const result=project(snapshot,[],now);
 assert.equal(result.active_unrealized_model_pnl,null);
 assert.equal(result.active_portfolio[0].valuation_status,'UNAVAILABLE');
});
