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
 "CREATE TABLE IF NOT EXISTS vixale_v2.clean_daily_state(run_id text PRIMARY KEY REFERENCES vixale_v2.clean_runs(run_id),epoch text NOT NULL,session_date date NOT NULL,active jsonb NOT NULL,closed jsonb NOT NULL,UNIQUE(epoch,session_date))",
 "CREATE TABLE IF NOT EXISTS vixale_v2.clean_publication_outbox(run_id text PRIMARY KEY REFERENCES vixale_v2.clean_runs(run_id),status text NOT NULL DEFAULT 'DISABLED' CHECK(status='DISABLED'),created_at timestamptz DEFAULT now())"
];
function dbName(url){if(!url)throw Error('Database URL missing');const n=new URL(url).pathname.slice(1);if(!/^vixale_engine_v2_shadow_\d{8}$/.test(n))throw Error('Refusing non-shadow database');return n}
function validateMorningCommit(input){
 const evidence=validateResearchBatch(input.researchBatch||{});
 if(evidence.status!=='PASS')return {status:'BLOCKED',reason:'RESEARCH_NOT_CERTIFIED',details:evidence.errors};
 if(input.date!==input.researchBatch.date)return {status:'BLOCKED',reason:'RESEARCH_DATE_MISMATCH'};
 if(!Array.isArray(input.events))return {status:'BLOCKED',reason:'EVENTS_MISSING'};
 if(!Array.isArray(input.positions)||!Array.isArray(input.closed))return {status:'BLOCKED',reason:'MISSING_COMPLETE_POSITION_LEDGERS'};
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
  // An epoch cannot silently reuse the old ledger, and later dates require an
  // independently persisted predecessor. Immutable state is in the SAME commit.
  const priorState=await db.query('SELECT session_date::text AS date,active,closed FROM vixale_v2.clean_daily_state WHERE epoch=$1 AND session_date<$2 ORDER BY session_date DESC LIMIT 1',[EPOCH,inputs.date]);
  // Epoch is the accounting inception, not an assertion of unverified trades on that day.
  // A first verified review may occur after Oct 19, with zero inherited holdings.
  if(priorState.rowCount){
   const priorOpen=new Map(priorState.rows[0].active.map(x=>[x.ticker+'|'+x.entryDate,x]));
   const priorClosed=new Map(priorState.rows[0].closed.map(x=>[x.ticker+'|'+x.entryDate,x]));
   const currentOpen=new Map(inputs.positions.map(x=>[x.ticker+'|'+x.entryDate,x]));
   const currentClosed=new Map(inputs.closed.map(x=>[x.ticker+'|'+x.entryDate,x]));
   for(const [id,prior] of priorClosed){
    if(!currentClosed.has(id)||JSON.stringify(currentClosed.get(id))!==JSON.stringify(prior))throw Error('Immutable closed lot changed '+id);
    if(currentOpen.has(id))throw Error('Closed trade reopened '+id);
   }
   for(const [id] of priorOpen)if(!currentOpen.has(id)&&!currentClosed.has(id))throw Error('Open lot vanished without close '+id);
  }
  const activeTickers=new Set(inputs.positions.map(x=>x.ticker));
  const publicCandidates=inputs.researchBatch.items.filter(x=>!activeTickers.has(x.ticker)).map(x=>({
   ticker:x.ticker,score:x.score,review_date:inputs.date,
   brief_reason:typeof x.publicNote==='string'&&x.publicNote.length<=260?x.publicNote:'Full nine-factor review completed '+inputs.date
  }));
  const manifest={research:check.evidence,publicCandidates,
   quotes:inputs.quotes.map(q=>({ticker:q.ticker,sourceId:q.sourceId,timestamp:q.timestamp}))};
  const hash=createHash('sha256').update(JSON.stringify({plan:check.plan,events:check.events,manifest,active:inputs.positions,closed:inputs.closed})).digest('hex');
  const prev=await db.query('SELECT payload_hash FROM vixale_v2.clean_runs WHERE epoch=$1 AND session_date=$2',[EPOCH,inputs.date]);
  if(prev.rowCount){await db.query('COMMIT');return {status:prev.rows[0].payload_hash===hash?'IDEMPOTENT_REPLAY':'CONFLICTING_DATE_RUN',runId:check.plan.runId,published:false}}
  await db.query('INSERT INTO vixale_v2.clean_runs(run_id,epoch,session_date,payload_hash,model,evidence_manifest) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
    [check.plan.runId,EPOCH,inputs.date,hash,JSON.stringify(check.plan.model),JSON.stringify(manifest)]);
  for(const e of check.events)await db.query('INSERT INTO vixale_v2.clean_events(event_id,run_id,type,ticker,entry_date,event_at,source_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [e.eventId,check.plan.runId,e.type,e.ticker,e.entryDate,e.timestamp,e.sourceId,JSON.stringify(e)]);
  await db.query('INSERT INTO vixale_v2.clean_daily_state(run_id,epoch,session_date,active,closed) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[check.plan.runId,EPOCH,inputs.date,JSON.stringify(inputs.positions),JSON.stringify(inputs.closed)]);
  await db.query('INSERT INTO vixale_v2.clean_publication_outbox(run_id,status) VALUES($1,$2)',[check.plan.runId,'DISABLED']);
  await db.query('COMMIT');
  return {status:'SHADOW_COMMITTED',runId:check.plan.runId,events:check.events.length,published:false};
 }catch(e){try{await db.query('ROLLBACK')}catch{}throw e}finally{await db.end()}
}
async function readLastCleanState({url,clientFactory=opts=>new Client(opts)}){
 const name=dbName(url),db=clientFactory({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});
 await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  if((await db.query('SELECT current_database() AS db')).rows[0].db!==name)throw Error('Database identity mismatch');
  const exists=await db.query("SELECT to_regclass('vixale_v2.clean_daily_state') AS table_name");
  if(!exists.rows[0].table_name){await db.query('COMMIT');return null}
  const q=await db.query('SELECT d.session_date::text AS date,d.active,d.closed,r.evidence_manifest FROM vixale_v2.clean_daily_state d JOIN vixale_v2.clean_runs r ON d.run_id=r.run_id WHERE d.epoch=$1 ORDER BY d.session_date DESC LIMIT 1',[EPOCH]);
  await db.query('COMMIT');
  return q.rowCount?{epoch:EPOCH,date:q.rows[0].date,active:q.rows[0].active,closed:q.rows[0].closed,candidates:q.rows[0].evidence_manifest?.publicCandidates||[]}:null;
 }catch(e){try{await db.query('ROLLBACK')}catch{}throw e}finally{await db.end()}
}
module.exports={ddl,dbName,validateMorningCommit,commitShadowRun,readLastCleanState};
