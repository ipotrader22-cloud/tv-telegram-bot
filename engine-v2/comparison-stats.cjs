'use strict';
// Read-only operational aggregate; never returns customer data, trades, credentials or SQL.
const {Client}=require('pg');
async function comparisonStats(url){
 const db=new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const q=await db.query("SELECT count(*)::int AS checks, max(checked_at) AS latest_check, max(source_date)::text AS latest_source_date, count(*) FILTER (WHERE closed_changed>0)::int AS changed_checks FROM vixale_v2.shadow_comparison_history");
  await db.query('COMMIT');
  return q.rows[0];
 }finally{await db.end()}
}
module.exports={comparisonStats};
