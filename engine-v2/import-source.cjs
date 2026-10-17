'use strict';
// Restricted shadow import: requires a deliberate JSON payload and does not manufacture trade event timestamps.
// Runs only on the isolated VIXALE shadow database, not the production Sheet.
const {Client}=require('pg');
const assert=(x,m)=>{if(!x)throw Error(m)};
async function loadSnapshot({url=process.env.VIXALE_V2_SHADOW_DATABASE_URL,payload}){
 assert(url&&/^vixale_engine_v2_shadow_\d{8}$/.test(new URL(url).pathname.slice(1)),'Unexpected shadow database');
 assert(payload&&Array.isArray(payload.closed)&&Array.isArray(payload.equity)&&Array.isArray(payload.active),'Missing source records');
 const db=new Client({connectionString:url});await db.connect();
 try{
  await db.query('BEGIN');
  assert((await db.query('SELECT current_database() AS name')).rows[0].name===new URL(url).pathname.slice(1),'Database identity mismatch');
  await db.query('CREATE TABLE IF NOT EXISTS vixale_v2.source_snapshots(snapshot_id text PRIMARY KEY, source_date date NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL, checksum text NOT NULL)');
  const crypto=require('node:crypto');const encoded=JSON.stringify(payload);const checksum=crypto.createHash('sha256').update(encoded).digest('hex');
  await db.query('INSERT INTO vixale_v2.source_snapshots(snapshot_id,source_date,payload,checksum) VALUES($1,$2,$3,$4) ON CONFLICT(snapshot_id) DO NOTHING',[checksum,payload.asOf,encoded,checksum]);
  await db.query('COMMIT');
  return {checksum,closed:payload.closed.length,equity:payload.equity.length,active:payload.active.length};
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
module.exports={loadSnapshot};
