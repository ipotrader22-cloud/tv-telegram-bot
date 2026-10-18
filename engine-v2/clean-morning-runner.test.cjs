'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runFirstSession}=require('./clean-morning-runner.cjs');
test('missing providers fail closed without writing',async()=>assert.equal((await runFirstSession({date:'2026-10-19'})).status,'BLOCKED'));
test('closed exchange session cannot commit',async()=>{
 let calls=0;const r=await runFirstSession({runAt:'2026-10-19T10:00:00-04:00',sessionProvider:{getSession:async()=>({date:'2026-10-19',isTradingDay:false,providerVerified:true})},researchProvider:{getBatch:async()=>{calls++}},quoteProvider:{getQuotes:async()=>{calls++}},commit:async()=>{calls++}});
 assert.equal(r.reason,'TRADING_SESSION_UNVERIFIED');assert.equal(calls,0);
});
test('research provider outage causes no financial writes',async()=>{
 let calls=0;const r=await runFirstSession({runAt:'2026-10-19T10:00:00-04:00',sessionProvider:{getSession:async()=>({date:'2026-10-19',isTradingDay:true,providerVerified:true})},researchProvider:{getBatch:async()=>{throw Error('Provider offline')}},quoteProvider:{getQuotes:async()=>[]},commit:async()=>{calls++}});
 assert.equal(r.reason,'UPSTREAM_DATA_UNAVAILABLE');assert.equal(calls,0);
});
