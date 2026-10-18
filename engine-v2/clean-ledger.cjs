'use strict';
const {Client}=require('pg');
const {createHash}=require('node:crypto');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {validateResearchBatch}=require('./research-attestation.cjs');
const {planMorningRun}=require('./morning-run-plan.cjs');
// Shadow-only SQL: unique session, immutable event IDs, publication disabled by constraint.
const ddl=[
 'CREATE SCHEMA IF NOT EXISTS vixale_v2',
 'CREATE TABLE IF NOT EXISTS vixale_v2.clean_epoch(epoch text PRIMARY KEY,capital numeric NOT NULL CHECK(capital=100000),created_at timestamptz DEFAULT now())',
 "CREATE TABLE IF NOT EXISTS vixale_v2.clean_runs(run_id text PRIMARY KEY,epoch text NOT NULL REFERENCES vixale_v2.clean_epoch(epoch),session_date date NOT NULL,payload_hash text NOT NULL,model jsonb NOT NULL,evidence_manifest jsonb NOT NULL,accepted_at timestamptz DEFAULT now(),UNIQUE(epoch,session_date))",
 "CREATE TABLE IF NOT EXISTS vixale_v2.clean_events(event_id text PRIMARY KEY,run_id text NOT NULL REFERENCES vixale_v2.clean_runs(run_id),type text NOT NULL CHECK(type IN ('OPEN','CLOSE','KEEP')),ticker text NOT NULL,entry_date date NOT NULL,event_at timestamptz NOT NULL,source_id text NOT NULL,payload jsonb NOT NULL,CHECK(entry_date >= '2026-10-19'::date))",
 "CREATE TABLE IF NOT EXISTS vixale_v2.clean_publication_outbox(run_id text PRIMARY KEY REFERENCES vixale_v2.clean_runs(run_id),status text NOT NULL DEFAULT 'DISABLED' CHECK(status='DISABLED'),created_at timestamptz DEFAULT now())"
];
function dbName(url){if(!url)throw Error('Database URL missing');const n=new URL(url).pathname.slice(1);if(!/^vixale_engine_v2_shadow_\d{8}$/.test(n))throw Error('Refusing non-shadow database');return n}
function validateMorningCommit(input){
 const evidence=validateResearchBatch(input.researchBatch||{});
 if(evidence.status!=='PASS')return {status:'BLOCKED',reason:'RESEARCH_NOT_CERTIFIED',details:evidence.errors};
 if(input.date!==input.researchBatch.date)return {status:'BLOCKED',reason:'RESEARCH_DATE_MISMATCH'};
 if(!Array.isArray(input.events))return {status:'BLOCKED',reason:'EVENTS_MISSING'};
 const seen=new Set();
 for(const e of input.events){
  if(!e||!['OPEN','CLOSE','KEEP'].includes(e.type)||!e.sourceId||!e.ticker||!e.entryDate||e.entryDate<EPOCH||
     !e.timestamp||!Number.isFinite(Date.parse(e.timestamp))||
     e.eventId!==[e.ticker,e.entryDate,e.type,input.date].join('|')||seen.has(e.eventId))
    return {status:'BLOCKED',reason:'INVALID_OR_DUPLICATE_EVENT'};
  seen.add(e.eventId);
 }
 const plan=planMorningRun(input);
 if(plan.status!=='VALIDATED_SHADOW_ONLY')return {status:'BLOCKED',reason:'MORNING_PLAN_REJECTED',details:plan};
 return {status:'READY_FOR_SHADOW_COMMIT',plan,evidence,events:input.events};
}
async function commitShadowRun({url,inputs,clientFactory=opts=>new Client(opts)}){
 const name=dbName(url),check=validateMorningCommit(inputs);
 if(check.status!=='READY_FOR_SHADOW_COMMIT')return check;
 const db=clientFactory({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});
 await db.connect();
 try{
  await db.query('BEGIN');
  if((await db.query('SELECT current_database() AS db')).rows[0].db!==name)throw Error('Database identity mismatch');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['vixale_v2|clean-slate|'+EPOCH]);
  for(const sql of ddl)await db.query(sql);
  await db.query('INSERT INTO vixale_v2.clean_epoch(epoch,capital) VALUES($1,100000) ON CONFLICT(epoch) DO NOTHING',[EPOCH]);
  const manifest={research:check.evidence,quotes:inputs.quotes.map(q=>({ticker:q.ticker,sourceId:q.sourceId,timestamp:q.timestamp}))};
  const hash=createHash('sha256').update(JSON.stringify({plan:check.plan,events:check.events,manifest})).digest('hex');
  const prev=await db.query('SELECT payload_hash FROM vixale_v2.clean_runs WHERE epoch=$1 AND session_date=$2',[EPOCH,inputs.date]);
  if(prev.rowCount){await db.query('COMMIT');return {status:prev.rows[0].payload_hash===hash?'IDEMPOTENT_REPLAY':'CONFLICTING_DATE_RUN',runId:check.plan.runId,published:false}}
  await db.query('INSERT INTO vixale_v2.clean_runs(run_id,epoch,session_date,payload_hash,model,evidence_manifest) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
    [check.plan.runId,EPOCH,inputs.date,hash,JSON.stringify(check.plan.model),JSON.stringify(manifest)]);
  for(const e of check.events)await db.query('INSERT INTO vixale_v2.clean_events(event_id,run_id,type,ticker,entry_date,event_at,source_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [e.eventId,check.plan.runId,e.type,e.ticker,e.entryDate,e.timestamp,e.sourceId,JSON.stringify(e)]);
  await db.query('INSERT INTO vixale_v2.clean_publication_outbox(run_id,status) VALUES($1,$2)',[check.plan.runId,'DISABLED']);
  await db.query('COMMIT');
  return {status:'SHADOW_COMMITTED',runId:check.plan.runId,events:check.events.length,published:false};
 }catch(e){try{await db.query('ROLLBACK')}catch{}throw e}finally{await db.end()}
}
module.exports={ddl,dbName,validateMorningCommit,commitShadowRun};
