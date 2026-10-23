'use strict';
// Independent shadow journal. No production DB, outbox, route or schema mutation.
const {Client}=require('pg');
const {dbName}=require('./clean-ledger.cjs');
const {assertArtifact}=require('./staging-artifact.cjs');
const DDL=`CREATE TABLE IF NOT EXISTS vixale_v2.staging_pipeline (
 session_date date PRIMARY KEY, run_id text UNIQUE NOT NULL, snapshot_id text NOT NULL,
 artifact jsonb NOT NULL, state jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now())`;
function createPipelineStore({url,clientFactory=opts=>new Client(opts)}={}){
 const name=dbName(url);
 async function connect(){
  const db=clientFactory({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});await db.connect();
  if((await db.query('SELECT current_database() AS db')).rows[0].db!==name){await db.end();throw Error('DATABASE_IDENTITY_MISMATCH')}
  return db;
 }
 return {
  async withLock(work){
   const db=await connect();let locked=false,lost=false;
   db.on?.('error',()=>{lost=true});
   try{
    const lock=await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['engine2-staging-pipeline']);
    if(!lock.rows[0].locked)return {status:'BUSY',published:false};locked=true;
    await db.query('CREATE SCHEMA IF NOT EXISTS vixale_v2');await db.query(DDL);
    const guard=async()=>{if(lost)throw Error('PIPELINE_LOCK_CONNECTION_LOST');await db.query('SELECT 1')};
    const repo={
     guard,
     async get(date){await guard();return (await db.query('SELECT artifact,state FROM vixale_v2.staging_pipeline WHERE session_date=$1',[date])).rows[0]||null},
     async save(artifact){
      assertArtifact(artifact);await guard();const p=artifact.manifest.payload;
      await db.query('INSERT INTO vixale_v2.staging_pipeline(session_date,run_id,snapshot_id,artifact) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(session_date) DO NOTHING',[p.date,p.runId,artifact.manifest.fingerprint,JSON.stringify(artifact)]);
      const stored=await repo.get(p.date);
      if(stored.artifact.manifest.fingerprint!==artifact.manifest.fingerprint)throw Error('PIPELINE_IMMUTABLE_SNAPSHOT_CONFLICT');
      return stored;
     },
     async update(date,changes){await guard();const q=await db.query("UPDATE vixale_v2.staging_pipeline SET state=state||$2::jsonb,updated_at=now() WHERE session_date=$1 RETURNING state",[date,JSON.stringify(changes)]);if(q.rowCount!==1)throw Error('PIPELINE_RUN_MISSING');return q.rows[0].state},
     async pending(){return (await db.query("SELECT session_date::text AS date FROM vixale_v2.staging_pipeline WHERE COALESCE(state->>'delivery','') NOT IN ('DELIVERED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED','EMAIL_DISABLED') ORDER BY session_date LIMIT 1")).rows[0]?.date||null}
    };
    return await work(repo);
   }finally{if(locked&&!lost)try{await db.query('SELECT pg_advisory_unlock(hashtext($1))',['engine2-staging-pipeline'])}catch{}await db.end()}
  },
  async publishedFeed(){
   const db=await connect();
   try{
    const exists=await db.query("SELECT to_regclass('vixale_v2.staging_pipeline') AS name");if(!exists.rows[0].name)return null;
    const q=await db.query("SELECT artifact FROM vixale_v2.staging_pipeline WHERE state->>'sheet'='VERIFIED' ORDER BY session_date DESC LIMIT 1");
    if(!q.rowCount)return null;return assertArtifact(q.rows[0].artifact).feed;
   }finally{await db.end()}
  }
 };
}
module.exports={createPipelineStore,DDL};
