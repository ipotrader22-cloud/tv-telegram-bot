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
 }finally{await db.query('DROP SCHEMA IF EXISTS vixale_v2 CASCADE');await db.end()}
});
