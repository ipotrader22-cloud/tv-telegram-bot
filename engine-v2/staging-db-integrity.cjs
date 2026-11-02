'use strict';
// Private, read-only staging ledger inspection. Emits aggregate evidence only.
// Never opens a public API or grants external PostgreSQL network access.
const {Client}=require('pg');
const {dbName}=require('./clean-ledger.cjs');
const EPOCH='2026-10-19';
const centsEqual=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<0.011;
const fail=reason=>({status:'BLOCKED',reason,writesPerformed:false});

async function auditStagingDb({url,date,clientFactory=opts=>new Client(opts)}={}){
 if(!/^20\d\d-\d\d-\d\d$/.test(date||''))return fail('INVALID_SESSION_DATE');
 let expected;
 try{expected=dbName(url)}catch{return fail('SHADOW_DATABASE_REQUIRED')}
 let db,opened=false;
 try{
  db=clientFactory({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});
  await db.connect();
  await db.query('BEGIN READ ONLY');opened=true;
  const identity=await db.query('SELECT current_database() AS db');
  if(identity.rows[0]?.db!==expected)return fail('DATABASE_IDENTITY_MISMATCH');
  const tables=await db.query("SELECT to_regclass('vixale_v2.clean_runs') AS runs, to_regclass('vixale_v2.clean_events') AS events, to_regclass('vixale_v2.clean_daily_state') AS daily, to_regclass('vixale_v2.staging_pipeline') AS pipeline, to_regclass('vixale_v2.preopen_preparations') AS preopen");
  if(Object.values(tables.rows[0]||{}).some(x=>!x))return fail('STAGING_TABLES_MISSING');
  const runRows=(await db.query('SELECT run_id,model,evidence_manifest FROM vixale_v2.clean_runs WHERE epoch=$1 AND session_date=$2',[EPOCH,date])).rows;
  const stateRows=(await db.query('SELECT run_id,active,closed FROM vixale_v2.clean_daily_state WHERE epoch=$1 AND session_date=$2',[EPOCH,date])).rows;
  const pipelineRows=(await db.query('SELECT run_id,snapshot_id,artifact,state FROM vixale_v2.staging_pipeline WHERE session_date=$1',[date])).rows;
  const preopenRows=(await db.query('SELECT count(*)::integer AS n FROM vixale_v2.preopen_preparations WHERE session_date=$1',[date])).rows;
  if(runRows.length!==1||stateRows.length!==1||pipelineRows.length!==1||preopenRows[0]?.n!==1)return fail('SESSION_JOURNAL_CARDINALITY_MISMATCH');
  const run=runRows[0],daily=stateRows[0],pipeline=pipelineRows[0];
  if(run.run_id!==daily.run_id||run.run_id!==pipeline.run_id)return fail('RUN_ID_MISMATCH');
  const events=(await db.query('SELECT event_id,type,ticker,entry_date::text AS entry_date FROM vixale_v2.clean_events WHERE run_id=$1',[run.run_id])).rows;
  const expectedEvents=run.evidence_manifest?.inputs?.events;
  const expectedIds=Array.isArray(expectedEvents)?expectedEvents.map(e=>e.eventId):[];
  if(!Array.isArray(expectedEvents)||events.length!==expectedIds.length||
     new Set(expectedIds).size!==expectedIds.length||
     events.some(e=>!expectedIds.includes(e.event_id))||
     new Set(events.map(e=>[e.type,e.ticker,e.entry_date].join('|'))).size!==events.length)
    return fail('DUPLICATE_OR_MISSING_EVENTS');
  // Independently recheck the immutable current-session opening proof retained
  // with the journal. Older inception-only sessions had no carried lots.
  const inputs=run.evidence_manifest?.inputs||{};
  const carried=inputs.sourceEvidence?.previous?.active||[];
  if(!Array.isArray(carried))return fail('CURRENT_OPENING_AUDIT_INVALID');
  if(carried.length)try{
   require('./same-session-opening.cjs').verifyCurrentOpenings({
    date,runAt:inputs.runAt,positions:carried,openings:inputs.sourceEvidence?.openings||[]
   });
  }catch{return fail('CURRENT_OPENING_AUDIT_INVALID')}
  const active=daily.active,closed=daily.closed,model=run.model;
  if(!Array.isArray(active)||!Array.isArray(closed)||active.length>10||
     new Set(active.map(p=>p.ticker)).size!==active.length||
     !model||Number(model.active)!==active.length)return fail('MODEL_MEMBERSHIP_MISMATCH');
  const unrealized=active.reduce((sum,p)=>sum+10000*(Number(p.currentPrice)/Number(p.entryPrice)-1),0);
  const realized=closed.filter(c=>c.includePublic!=='NO'&&c.effectiveDate<=date).reduce((sum,p)=>sum+10000*(Number(p.exitPrice)/Number(p.entryPrice)-1),0);
  if(!centsEqual(unrealized,model.unrealized)||!centsEqual(realized,model.realized)||
     !centsEqual(Number(model.realized)+Number(model.unrealized),model.total)||
     !centsEqual(100000+Number(model.total),model.equity))
    return fail('NORMALIZED_ACCOUNTING_MISMATCH');
  const artifact=pipeline.artifact;
  if(artifact?.manifest?.fingerprint!==pipeline.snapshot_id||
     artifact?.manifest?.payload?.runId!==run.run_id||
     artifact?.manifest?.payload?.date!==date||
     !centsEqual(artifact?.manifest?.payload?.model?.equity,model.equity)||
     artifact?.feed?.snapshot_id!==pipeline.snapshot_id||
     !Array.isArray(artifact?.positions)||
     JSON.stringify(artifact.positions.map(x=>x.ticker).sort())!==JSON.stringify(active.map(x=>x.ticker).sort())||
     pipeline.state?.sheet!=='VERIFIED'||pipeline.state?.publication!=='VERIFIED')
    return fail('PUBLICATION_JOURNAL_MISMATCH');
  return {status:'PASS',date,snapshotId:pipeline.snapshot_id,runCount:runRows.length,
   eventCount:events.length,activeCount:active.length,closedCount:closed.length,
   carriedOpeningEvidenceCount:carried.length,
   modelEquity:Number(model.equity),normalizedPnl:Number(model.total),
   sheetVerified:true,publicationVerified:true,
   deliveryStatus:String(pipeline.state.delivery||'UNKNOWN'),writesPerformed:false};
 }catch{return fail('STAGING_READ_ONLY_AUDIT_UNAVAILABLE')}
 finally{
  if(db){if(opened)try{await db.query('ROLLBACK')}catch{};try{await db.end()}catch{}}
 }
}
module.exports={auditStagingDb};
