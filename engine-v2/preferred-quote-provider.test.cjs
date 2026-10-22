'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPreferredQuoteProvider}=require('./preferred-quote-provider.cjs');
const date='2026-10-22',runAt='2026-10-22T10:00:00-04:00';
const live={ticker:'AMD',price:200,timestamp:'2026-10-22T09:59:30-04:00',sourceId:'IB-LAST-1',provider:'IBKR_TWS',session:'REGULAR',verified:true,exchangeVolume:50};
const fallback={ticker:'MU',price:100,timestamp:'2026-10-22T09:59:00-04:00',sourceId:'YAHOO_1M:MU',provider:'YAHOO_CHART',
 session:'REGULAR',verified:true,exchangeVolume:1200,priceKind:'MINUTE_BAR_CLOSE',indicative:true,delayed:true,modelFill:false};
test('retains verified IBKR LAST and fills missing ticker with explicit Yahoo mark',async()=>{
 const a=createPreferredQuoteProvider({allowIndicativeFallback:true,
 twsProvider:{getQuotes:async()=>[live]},
 yahooProvider:{getQuotes:async({tickers})=>{assert.deepEqual(tickers,['MU']);return [fallback]}}});
 const x=await a.getQuotes({date,runAt,tickers:['AMD','MU']});
 assert.equal(x[0].provider,'IBKR_TWS');assert.equal(x[1].modelFill,false);
});
test('no fallback authorization blocks missing TWS rather than synthesizing marks',async()=>{
 const a=createPreferredQuoteProvider({twsProvider:{getQuotes:async()=>[]},yahooProvider:{getQuotes:async()=>[fallback]}});
 await assert.rejects(()=>a.getQuotes({date,runAt,tickers:['MU']}),/FALLBACK_DISABLED/);
});
test('partial Yahoo coverage is not accepted as successful portfolio pricing',async()=>{
 const a=createPreferredQuoteProvider({allowIndicativeFallback:true,yahooProvider:{getQuotes:async()=>[fallback]}});
 await assert.rejects(()=>a.getQuotes({date,runAt,tickers:['MU','AMD']}),/INCOMPLETE_MARKET_PRICE_COVERAGE/);
});
