'use strict';
// Read-only analysis of immutable imported workbook snapshots.
// A PASS is historical/internal consistency, not verification against today's live Sheet.
const {Client}=require('pg');
const {auditAll}=require('./replay-all.cjs');
const {auditSnapshots}=require('./snapshot-audit.cjs');
const {auditValuation,auditImmutableEntries}=require('./valuation-integrity.cjs');
function inspectPayload(p){
 const realized=auditAll(p);
 const frozen=auditSnapshots({closed:p.closed,active:p.active,marks:p.equity,asOf:p.asOf});
 const valuation=auditValuation(p.active||[]);
 const entryIntegrity=Array.isArray(p.previousActive)?auditImmutableEntries(p.previousActive,p.active||[]):{status:'NOT_VERIFIED',changes:[],deleted:0};
 return {asOf:p.asOf,realized:{status:realized.status,dates:realized.dates,failed:realized.failed},frozen:{status:frozen.status,errors:frozen.errors,unverified:frozen.unverified.length,unverifiedByDate:frozen.unverified.map(x=>({date:x.date,gate:x.gate})).sort((a,b)=>a.date.localeCompare(b.date)||a.gate.localeCompare(b.gate))},valuation:{status:valuation.status,errors:valuation.errors,marketValue:valuation.marketValue,unrealized:valuation.unrealized},entryIntegrity,activeCount:p.active.length,source:'IMPORTED_SNAPSHOT_NOT_LIVE'};
}
async function compareStored({url}){
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});
 await client.connect();
 try{
  await client.query('BEGIN READ ONLY');
  const r=await client.query('SELECT source_date::text AS as_of,payload,checksum,received_at FROM vixale_v2.source_snapshots ORDER BY received_at DESC LIMIT 1');
  await client.query('COMMIT');
  if(!r.rowCount)return {status:'MISSING_IMPORT'};
  const a=inspectPayload(r.rows[0].payload);
  return {...a,checksum:r.rows[0].checksum,storedAt:r.rows[0].received_at,status:a.valuation.status!=='PASS'||a.entryIntegrity.status==='REVIEW_REQUIRED'?'BLOCKED':a.realized.status==='PASS'&&a.frozen.status==='PASS'?'PASS':a.realized.status==='PASS'&&a.frozen.status==='PARTIAL'?'PARTIAL':'BLOCKED'};
 }finally{await client.end()}
}
module.exports={inspectPayload,compareStored};
