'use strict';
// Persistent STAGING intent only; never invokes Resend or changes live sheets.
async function persistNotification({db,intent}={}){
 if(!db?.query||intent?.status!=='STAGING_ONLY'||intent.deliveryEnabled!==false)throw Error('Verified staging intent required');
 const parts=String(intent.runId||'').split('|');
 const date=parts[2];
 if(parts[0]!=='engine2'||parts[1]!=='2026-10-19'||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Invalid clean-slate run');
 const payload={runId:intent.runId,snapshotId:intent.snapshotId,recipient:intent.recipient};
 const q=await db.query("INSERT INTO vixale_v2.delivery_outbox(idempotency_key,event_type,trading_date,payload,status) VALUES($1,'MODEL_REVIEW',$2,$3::jsonb,'PENDING') ON CONFLICT(idempotency_key) DO NOTHING RETURNING idempotency_key",[intent.key,date,JSON.stringify(payload)]);
 return {status:q.rowCount===1?'STAGED':'ALREADY_STAGED',sent:false,key:intent.key};
}
module.exports={persistNotification};
