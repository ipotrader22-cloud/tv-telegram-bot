'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bridgeQuoteProvider}=require('./bridge-quote-provider.cjs');
const date='2026-10-19',runAt='2026-10-19T10:00:00-04:00';
const trade={symbol:'AMD',source:'TWS',market_data_type:1,last:200,quote_kind:'LAST_TRADE',trade_id:'test-print',last_size:20,last_timestamp:'2026-10-19T09:59:45-04:00'};
const record={authenticated:true,receivedAt:'2026-10-19T09:59:50-04:00',payload:{quotes:[trade]}};
test('authenticated contemporaneous LAST quote accepted in adapter contract',async()=>{
 const q=await bridgeQuoteProvider({loadAuthenticatedPayload:async()=>record}).getQuotes({date,runAt,tickers:['AMD']});
 assert.equal(q[0].price,200);
});
test('untrusted source blocks',async()=>await assert.rejects(bridgeQuoteProvider({loadAuthenticatedPayload:async()=>({...record,authenticated:false})}).getQuotes({date,runAt,tickers:['AMD']}),/Authenticated/));
test('stale receipt blocks',async()=>await assert.rejects(bridgeQuoteProvider({loadAuthenticatedPayload:async()=>({...record,receivedAt:'2026-10-19T09:55:00-04:00'})}).getQuotes({date,runAt,tickers:['AMD']}),/stale/));
