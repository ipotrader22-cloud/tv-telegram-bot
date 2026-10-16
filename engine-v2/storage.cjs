'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {reduce}=require('./journal.cjs');
const sha=e=>createHash('sha256').update(JSON.stringify(e)).digest('hex');
const lotKey=e=>[e.ticker,e.entryDate];
const ok=(x,m)=>{if(!x)throw Error(m)};
/** Shadow database transaction. Not connected to production; callers inject an isolated pg Pool. */
async function transact({pool,event,shadowOnly=true}){
 ok(shadowOnly===true,'Production writes disabled');
 ok(pool&&typeof pool.connect==='function','pool required');
 // Run the exact event through the pure validator, with existing-state rules rechecked under DB lock.
 ok(event&&['OPEN','CLOSE'].includes(event.type),'Unsupported event');
 const client=await pool.connect();
 let committed=false;
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)',[8047202602]);
  const digest=sha(event);
  const prior=await client.query('SELECT payload_hash FROM vixale_v2.model_events WHERE event_id=$1',[event.eventId]);
  if(prior.rows.length){
   ok(prior.rows[0].payload_hash===digest,'Conflicting event replay');
   await client.query('COMMIT');committed=true;return {applied:false};
  }
  const existing=await client.query('SELECT lot_id,ticker,entry_date::text AS "entryDate",entry_at AS "entryAt",entry_price AS "entryPrice",exit_at AS "exitAt" FROM vixale_v2.model_lots WHERE ticker=$1 AND entry_date=$2 FOR UPDATE',lotKey(event));
  const count=await client.query('SELECT COUNT(*)::int AS n FROM vixale_v2.model_lots WHERE exit_at IS NULL');
  if(event.type==='OPEN'){
   ok(existing.rows.length===0,'Duplicate historical lot');
   ok(Number.isInteger(event.entryScore)&&event.entryScore>=0&&event.entryScore<=100,'Verified entry score required');
   ok(count.rows[0].n<10,'Active limit');
   reduce(undefined,event); // validate evidence and event fingerprint before insert
   const lotId=randomUUID();
   await client.query('INSERT INTO vixale_v2.model_lots(lot_id,ticker,entry_date,entry_at,entry_price,entry_score) VALUES($1,$2,$3,$4,$5,$6)',[lotId,event.ticker,event.entryDate,event.entryTime,event.entryPrice,event.entryScore]);
   await client.query('INSERT INTO vixale_v2.model_events(event_id,payload_hash,lot_id,kind,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6)',[event.eventId,digest,lotId,'OPEN',JSON.stringify(event),event.entryTime]);
  } else {
   ok(existing.rows.length===1&&!existing.rows[0].exitAt,'Lot is not open');
   const row=existing.rows[0];
   // validate close with actual persisted original entry
   const original={eventId:'validated-opening',type:'OPEN',ticker:event.ticker,entryDate:event.entryDate,entryPrice:Number(row.entryPrice),entryTime:new Date(row.entryAt).toISOString()};
   const v=reduce(undefined,original);
   reduce(v.state,event);
   await client.query('UPDATE vixale_v2.model_lots SET exit_at=$1,exit_price=$2,exit_reason=$3,include_public=$4,public_effective_date=$5 WHERE lot_id=$6 AND exit_at IS NULL',[event.exitTime,event.exitPrice,event.reason,event.includePublic,event.effectiveDate,row.lot_id]);
   await client.query('INSERT INTO vixale_v2.model_events(event_id,payload_hash,lot_id,kind,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6)',[event.eventId,digest,row.lot_id,'CLOSE',JSON.stringify(event),event.exitTime]);
  }
  await client.query('COMMIT');committed=true;return {applied:true};
 }catch(e){if(!committed)try{await client.query('ROLLBACK')}catch(_){}throw e}
 finally{client.release()}
}
module.exports={transact};
