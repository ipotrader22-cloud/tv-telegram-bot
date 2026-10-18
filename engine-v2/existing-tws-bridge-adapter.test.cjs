'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fromExistingBridge}=require('./existing-tws-bridge-adapter.cjs');
const date='2026-10-19',at='2026-10-19T10:00:00-04:00';
const raw={symbol:'AMD',source:'TWS',market_data_type:1,last:200,
 quote_kind:'LAST_TRADE',trade_id:'ibkr-123',last_size:20,last_timestamp:'2026-10-19T09:59:45-04:00'};
const args={date,at,tickers:['AMD'],payload:{timestamp_ms:Date.parse(at),quotes:[raw]}};
test('existing bridge retains independent verified LAST timestamp',()=>assert.equal(fromExistingBridge(args).status,'PASS'));
test('existing dashboard price without a trade timestamp may not enter model',()=>assert.equal(fromExistingBridge({...args,payload:{quotes:[{symbol:'AMD',price:200,source:'TWS'}]}}).status,'BLOCKED'));
test('delayed IBKR quote is display only, never executable model entry',()=>assert.equal(fromExistingBridge({...args,payload:{quotes:[{...raw,source:'TWS delayed',market_data_type:3}]}}).status,'BLOCKED'));
test('midpoint is not a LAST print even if the dashboard price is positive',()=>assert.equal(fromExistingBridge({...args,payload:{quotes:[{...raw,quote_kind:'MIDPOINT'}]}}).status,'BLOCKED'));
test('a second requested symbol must be present',()=>assert.equal(fromExistingBridge({...args,tickers:['AMD','MU']}).status,'BLOCKED'));
