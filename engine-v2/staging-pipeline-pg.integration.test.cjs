'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('pg');
const {createPipelineStore}=require('./staging-pipeline-store.cjs');
const {readCleanRun,commitShadowRun}=require('./clean-ledger.cjs');
const {harness}=require('./test-support/staging-harness.cjs');
const {date}=require('./test-support/staging-fixture.cjs');
const url=process.env.VIXALE_V2_PIPELINE_TEST_DATABASE_URL;
test('real PostgreSQL pipeline: JSONB roundtrip, lock competition, durable restart, unique run and one delivered email',{skip:!url},async t=>{
 const target=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));assert.equal(target.pathname,'/vixale_engine_v2_shadow_20990101');
 const db=new Client({connectionString:url});await db.connect();
 try{
  await db.query('DROP SCHEMA IF EXISTS vixale_v2 CASCADE');
  const store=createPipelineStore({url}),competitor=createPipelineStore({url});
  await store.withLock(async()=>assert.equal((await competitor.withLock(()=>{throw Error('Second writer entered')})).status,'BUSY'));
  const {POLICY,hash}=require('./delayed-model-policy.cjs');
  const prep={policy:POLICY,date,preparedAt:date+'T12:00:00Z',items:[{ticker:'AMD',score:90}]};prep.fingerprint=hash(prep);
  await store.withLock(j=>j.savePrepared(prep));
  await competitor.withLock(async j=>{
   assert.deepEqual(await j.getPrepared(date),prep);
   await j.savePrepared(prep);
   const changed={...prep,preparedAt:date+'T12:01:00Z'};delete changed.fingerprint;changed.fingerprint=hash(changed);
   await assert.rejects(j.savePrepared(changed),/IMMUTABLE_CONFLICT/);
   assert.deepEqual(await j.getPrepared(date),prep);
  });
  const h=await harness(t,{store,ledger:{}});h.args.url=url;
  const first=await h.run();assert.equal(first.status,'ACCEPTED_NOT_DELIVERED',JSON.stringify(first));
  const record=await readCleanRun({url,date});assert.equal(record.evidence_manifest.inputs.researchBatch.sourceEvidence.artifact.mode,'CLEAN_EPOCH');
  assert.equal((await commitShadowRun({url,inputs:record.evidence_manifest.inputs})).status,'IDEMPOTENT_REPLAY');
  h.args.store=competitor;h.deliver();assert.equal((await h.run()).status,'DELIVERED');assert.equal(h.sends,1);assert.equal(h.sheets.writes,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM vixale_v2.clean_runs')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM vixale_v2.clean_events')).rows[0].n,1);
  assert.equal((await db.query("SELECT state->>'delivery' status FROM vixale_v2.staging_pipeline")).rows[0].status,'DELIVERED');
  // The delayed policy must also survive real JSONB storage and ledger commits.
  const previous=await require('./clean-ledger.cjs').readLastCleanState({url});
  const {priorIdentity,etTime}=require('./delayed-model-policy.cjs');
  const next='2026-10-23',at=next+'T14:00:00Z';
  const batch=JSON.parse(JSON.stringify(record.evidence_manifest.inputs.researchBatch).replaceAll('2026-10-22','2026-10-23').replaceAll('2026-10-21','2026-10-22').replaceAll('14:00:00','12:59:00').replaceAll('13:59:00','12:58:00'));
  const frozen={policy:POLICY,date:next,sourceSession:date,preparedAt:next+'T12:59:00Z',priorHash:hash(priorIdentity(previous)),batch,exits:[],checkedThrough:date+'T20:00:00.000Z'};frozen.fingerprint=hash(frozen);
  const quote={ticker:'AMD',price:113,timestamp:etTime(next,580),fetchedAt:at,provider:'YAHOO_CHART',sourceId:'pg-fixed-cutoff',session:'REGULAR',exchangeVolume:100,verified:true,policy:POLICY,priceKind:'MINUTE_BAR_CLOSE',indicative:true,modelFill:false};
  const inputs=require('./delayed-model-cycle.cjs').proposeDelayed({date:next,runAt:at,prepared:frozen,previous,quotes:[quote]});
  await assert.rejects(commitShadowRun({url,inputs}),/PREOPEN_DURABLE_ARTIFACT_MISMATCH/);
  await store.withLock(j=>j.savePrepared(frozen));
  assert.equal((await commitShadowRun({url,inputs})).status,'SHADOW_COMMITTED');
  assert.equal((await commitShadowRun({url,inputs})).status,'IDEMPOTENT_REPLAY');
  const saved=await readCleanRun({url,date:next});
  assert.equal(saved.evidence_manifest.inputs.priceAsOf,etTime(next,580));
  require('./staging-artifact.cjs').buildStagingArtifact(saved);

  // Google morning policy must retain identical durable preparation/prior gates.
  const googlePrevious=await require('./clean-ledger.cjs').readLastCleanState({url});
  const googleDate='2026-10-26',googleAt=googleDate+'T14:00:00.000Z';
  const googleBatch=JSON.parse(JSON.stringify(batch).replace(/2026-10-(22|23)/g,x=>({'2026-10-22':'2026-10-23','2026-10-23':'2026-10-26'}[x])));
  const googleFrozen={policy:POLICY,date:googleDate,sourceSession:next,preparedAt:googleDate+'T12:59:00Z',priorHash:hash(priorIdentity(googlePrevious)),batch:googleBatch,exits:[],checkedThrough:next+'T20:00:00.000Z'};
  googleFrozen.fingerprint=hash(googleFrozen);
  const {normalizeGoogleQuote,GOOGLE_POLICY}=require('./google-quote-provider.cjs');
  const googleQuote=normalizeGoogleQuote({symbol:'NASDAQ:AMD',price:114,tradeTimeET:googleDate+' 09:51:00',delayMinutes:15,dailyVolume:123456},{date:googleDate,fetchedAt:googleAt});
  const googleInputs=require('./delayed-model-cycle.cjs').proposeDelayed({date:googleDate,runAt:googleAt,prepared:googleFrozen,previous:googlePrevious,quotes:[googleQuote],pricePolicy:GOOGLE_POLICY});
  await assert.rejects(commitShadowRun({url,inputs:googleInputs}),/PREOPEN_DURABLE_ARTIFACT_MISMATCH/);
  await store.withLock(j=>j.savePrepared(googleFrozen));
  assert.equal((await commitShadowRun({url,inputs:googleInputs})).status,'SHADOW_COMMITTED');
  assert.equal((await commitShadowRun({url,inputs:googleInputs})).status,'IDEMPOTENT_REPLAY');
  const googleSaved=await readCleanRun({url,date:googleDate});
  assert.equal(googleSaved.evidence_manifest.inputs.pricePolicy,GOOGLE_POLICY);
  assert.equal(googleSaved.evidence_manifest.inputs.priceAsOf,googleDate+'T13:51:00.000Z');
  const googleArtifact=require('./staging-artifact.cjs').buildStagingArtifact(googleSaved);
  assert.equal(googleArtifact.feed.quote_times[0].provider,'GOOGLEFINANCE');

 }finally{await db.query('DROP SCHEMA IF EXISTS vixale_v2 CASCADE');await db.end()}
});
