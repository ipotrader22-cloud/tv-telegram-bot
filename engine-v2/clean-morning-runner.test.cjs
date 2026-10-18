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

test('complete simulated provider chain reaches shadow ledger with normalized model values',async()=>{
 const {CAPS}=require('./core.cjs');
 const {validateMorningCommit}=require('./clean-ledger.cjs');
 const date='2026-10-19',runAt='2026-10-19T10:00:00-04:00',stamp='2026-10-19T09:59:20-04:00';
 const factors={...CAPS};
 const factorsEvidence=Object.fromEntries(Object.keys(CAPS).map(k=>[k,{sourceId:'factor-'+k,explanation:'Verified source-backed factor'}]));
 const researchBatch={date,runAt,session:{date,isTradingDay:true,providerVerified:true},universe:['NVDA'],benchmarks:[{sourceId:'SPY-ohlcv',timestamp:stamp}],items:[
  {ticker:'NVDA',date,complete:true,timestamp:stamp,score:100,factors,factorsEvidence,completedDailyBars:250,lastCompletedSessionDate:'2026-10-16',ohlcvSourceId:'ohlcv',newsEvidenceId:'news',marketEvidenceId:'market',sectorEvidenceId:'sector',volumeRvol:1.1,exchangeVolumeVerified:true,ma20:190,ma50:180,ma200:150}
 ]};
 let committed=0;
 const output=await runFirstSession({date,runAt,url:'postgres://local/vixale_engine_v2_shadow_20261016',
  sessionProvider:{getSession:async()=>researchBatch.session},
  researchProvider:{getBatch:async()=>researchBatch},
  quoteProvider:{getQuotes:async()=>[{ticker:'NVDA',price:200,timestamp:stamp,sourceId:'trade',provider:'exchange',verified:true,session:'REGULAR',exchangeVolume:100}]},
  commit:async({inputs})=>{
   const verified=validateMorningCommit(inputs);
   assert.equal(verified.status,'READY_FOR_SHADOW_COMMIT');
   assert.equal(verified.plan.model.active,1);
   assert.equal(verified.plan.model.equity,100000);
   committed++;
   return {status:'SHADOW_COMMITTED',runId:verified.plan.runId};
  }
 });
 assert.equal(output.status,'SHADOW_COMMITTED');assert.equal(output.published,false);assert.equal(committed,1);
});
