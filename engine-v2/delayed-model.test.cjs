'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {POLICY,hash,etTime,priorIdentity,fixedQuote,validatePrepared}=require('./delayed-model-policy.cjs');
const {proposeDelayed,runDelayedCycle}=require('./delayed-model-cycle.cjs');
const {validateMorningCommit}=require('./clean-ledger.cjs');
const {buildStagingArtifact}=require('./staging-artifact.cjs');
const {renderShadowSwing}=require('./shadow-swing-page.cjs');
const {date,runAt,providers}=require('./test-support/staging-fixture.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
async function fixture(previous=null){
 const b=await providers().researchProvider.getBatch({date,runAt,session:sessionEvidence(date)});
 const batch=JSON.parse(JSON.stringify(b).replaceAll('14:00:00','12:59:00').replaceAll('13:59:00','12:58:00'));
 const p={policy:POLICY,date,sourceSession:'2026-10-21',preparedAt:date+'T12:59:00Z',priorHash:hash(priorIdentity(previous)),batch,exits:[],checkedThrough:'2026-10-21T20:00:00.000Z'};
 const seal=()=>{delete p.fingerprint;p.fingerprint=hash(p)};seal();
 const bar={ticker:'AMD',date,start:etTime(date,579),end:etTime(date,580),close:112,volume:100,provider:'YAHOO_CHART',sourceId:'fixed'};
 const q=fixedQuote([bar],{ticker:'AMD',date,fetchedAt:runAt});return {p,q,seal,bar};
}
test('fixed cutoff follows DST, never latest bar or retry minus twenty minutes',async()=>{
 assert.equal(etTime('2026-10-26',580),'2026-10-26T13:40:00.000Z');
 assert.equal(etTime('2026-11-02',580),'2026-11-02T14:40:00.000Z');
 const {bar}=await fixture(),later={...bar,start:etTime(date,580),end:etTime(date,581),close:999};
 assert.equal(fixedQuote([bar,later],{ticker:'AMD',date,fetchedAt:date+'T14:04:00Z'}).price,112);
 for(const bars of [[],[later],[bar,bar]])assert.throws(()=>fixedQuote(bars,{ticker:'AMD',date,fetchedAt:runAt}));
});
test('frozen research and fixed quotes pass commit; source and decision times are separate',async()=>{
 const {p,q}=await fixture();const input=proposeDelayed({date,runAt,prepared:p,previous:null,quotes:[q]});
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
 assert.equal(input.positions[0].entryTime,etTime(date,580));assert.equal(input.events[0].decisionAt,runAt);
 const check=validateMorningCommit(input),record={run_id:check.plan.runId,payload_hash:'proof',model:check.plan.model,evidence_manifest:{inputs:input}};
 const a=buildStagingArtifact(record);assert.equal(a.feed.reference_as_of,etTime(date,580));
 assert.match(renderShadowSwing(a.feed),/Модельные цены на 09:40/);
 const corrupt=structuredClone(input);corrupt.positions[0].entryPrice=1;assert.equal(validateMorningCommit(corrupt).status,'BLOCKED');
});
test('stop-trigger exits use 09:40 price, not stop level, and precede new entries',async()=>{
 const prev={epoch:'2026-10-19',date:'2026-10-21',active:[{ticker:'OLD',entryDate:'2026-10-20',entryTime:'2026-10-20T13:40:00Z',entryPrice:100,exchange:'NASDAQ'}],closed:[]};
 const {p,q,seal}=await fixture(prev),r=structuredClone(p.batch.items[0]);r.ticker='OLD';p.batch.universe.push('OLD');p.batch.items.push(r);
 p.exits.push({ticker:'OLD',entryDate:'2026-10-20',reason:'STOP LOSS',triggerAt:'2026-10-21T15:00:00Z',sourceId:'prior-low'});seal();
 const input=proposeDelayed({date,runAt,prepared:p,previous:prev,quotes:[q,{...q,ticker:'OLD',price:91}]});
 assert.equal(input.closed[0].exitPrice,91);assert.equal(input.events[0].type,'CLOSE');assert.equal(input.events[1].type,'OPEN');assert.equal(input.closed[0].exitDate,date);
 assert.equal(validateMorningCommit(input).status,'READY_FOR_SHADOW_COMMIT');
});
test('late, stale, mutated, wrong-state preparations fail closed',async()=>{
 const {p,seal,q}=await fixture();
 p.preparedAt=date+'T13:30:00Z';seal();assert.throws(()=>proposeDelayed({date,runAt,prepared:p,previous:null,quotes:[q]}),/PREOPEN_TIME/);
 p.preparedAt=date+'T12:59:00Z';p.sourceSession='2026-10-20';seal();assert.throws(()=>validatePrepared(p,{date,previous:null,now:runAt}),/IDENTITY/);
 p.sourceSession='2026-10-21';seal();p.exits.push({ticker:'AMD'});assert.throws(()=>validatePrepared(p,{date,previous:null,now:runAt}),/HASH/);
});
test('missing holding quote, wrong cutoff and post-window completion block before commit',async()=>{
 const {p,q}=await fixture();assert.throws(()=>proposeDelayed({date,runAt,prepared:p,previous:null,quotes:[{...q,timestamp:date+'T13:41:00Z'}]}));
 let commits=0;const result=await runDelayedCycle({date,runAt,prepared:p,clock:()=>new Date(date+'T14:06:00Z'),getPrior:async()=>null,quoteProvider:{getQuotes:async()=>[q]},commit:async()=>{commits++}});
 assert.equal(result.status,'BLOCKED');assert.equal(commits,0);
});
test('new policy does not relax legacy quote freshness',async()=>{
 const {p,q}=await fixture();const i=proposeDelayed({date,runAt,prepared:p,previous:null,quotes:[q]});delete i.pricePolicy;
 assert.equal(validateMorningCommit(i).status,'BLOCKED');
});
test('delayed cycle reaches Sheet/API/HTML parity and retry does not duplicate financial writes',async t=>{
 const {harness}=require('./test-support/staging-harness.cjs');
 const {p,q}=await fixture();let record=null,state=null,commits=0;
 const ledger={readRun:async()=>record,readState:async()=>state,runCycle:args=>runDelayedCycle({...args,getPrior:async()=>null,commit:async({inputs})=>{
  const v=validateMorningCommit(inputs);assert.equal(v.status,'READY_FOR_SHADOW_COMMIT');commits++;
  record={run_id:v.plan.runId,payload_hash:'delayed-proof',model:v.plan.model,evidence_manifest:{inputs,publicCandidates:[]}};
  state={epoch:'2026-10-19',date,active:inputs.positions,closed:inputs.closed,history:[{date,equity:v.plan.model.equity,realized:0,unrealized:0}]};return {status:'SHADOW_COMMITTED'};
 }})};
 const h=await harness(t,{ledger});h.args.emailEnabled=false;h.args.prepareProviders=async()=>({prepared:p,quoteProvider:{getQuotes:async()=>[q]}});
 assert.equal((await h.run()).status,'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED');
 assert.equal((await h.run()).status,'STAGING_PUBLICATION_VERIFIED_EMAIL_DISABLED');
 assert.equal(commits,1);assert.equal(h.sheets.writes,1);assert.equal(h.sends,0);
});
test('preopen cron dispatches preparation only and does not publish',async()=>{
 const {runScheduled}=require('./staging-cron.cjs');let preparations=0,ticks=0;
 const env={VIXALE_V2_SHADOW_MODE:'READ_ONLY',VIXALE_V2_SHADOW_DATABASE_URL:'postgres://localhost/vixale_engine_v2_shadow_20990101',VIXALE_V2_STAGING_PRICE_POLICY:POLICY};
 const result=await runScheduled({env,clock:()=>new Date('2026-10-26T12:00:00Z'),createWorker:()=>({status:()=>({enabled:true,missing:[]}),prepare:async()=>{preparations++;return {status:'PREOPEN_PREPARED'}},tick:async()=>{ticks++}})});
 assert.equal(result.status,'PREOPEN_PREPARED');assert.equal(preparations,1);assert.equal(ticks,0);
});
test('prior-session stop/target scan retains trigger, blocks a missing minute and excludes future bars',()=>{
 const {exitEvidence}=require('./preopen-preparation.cjs');
 const position={ticker:'AMD',entryDate:'2026-10-21',entryTime:'2026-10-21T19:58:00Z',entryPrice:100};
 const raw={chart:{result:[{meta:{symbol:'AMD'},timestamp:[Date.parse(position.entryTime)/1000,Date.parse('2026-10-21T19:59:00Z')/1000],indicators:{quote:[{open:[100,100],high:[101,111],low:[94,99],close:[99,110],volume:[100,100]}]}}]}};
 const out=exitEvidence(raw,{position,through:'2026-10-21T20:00:00Z'});assert.equal(out.reason,'STOP LOSS');assert.equal(out.triggerAt,'2026-10-21T19:59:00.000Z');
 raw.chart.result[0].indicators.quote[0].low[0]=null;
 assert.throws(()=>exitEvidence(raw,{position,through:'2026-10-21T20:00:00Z'}),/COVERAGE_GAP/);
});
