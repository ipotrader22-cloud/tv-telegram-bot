'use strict';
// Injectable PostgreSQL transaction boundary: no connection opened by this module.
const crypto=require('node:crypto');
const {reduce}=require('./journal.cjs');
const assert=(v,m)=>{if(!v)throw Error(m)};
async function transact({pool,event}){
 assert(pool&&typeof pool.connect==='function','pool required');
 assert(event&&typeof event.eventId==='string','event required');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Coarse engine ownership guard: PostgreSQL session transaction advisory lock.
  await client.query('SELECT pg_advisory_xact_lock($1)',[8047202602]);
  const existing=await client.query('SELECT payload_hash FROM vixale_v2.model_events WHERE event_id=$1',[event.eventId]);
  const digest=crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
  if(existing.rows.length){
   assert(existing.rows[0].payload_hash===digest,'conflicting event replay');
   await client.query('COMMIT');return {applied:false};
  }
  // No production writes; exact schema-backed materialization will be enabled only after shadow replay.
  await client.query('ROLLBACK');
  throw Error('SHADOW_ONLY: persistent writer is disabled pending historical migration and parity');
 }catch(error){
  try{await client.query('ROLLBACK')}catch(_){}
  throw error;
 }finally{client.release()}
}
module.exports={transact};
