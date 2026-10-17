'use strict';
// Separate shadow-only service: no trading writes, no portfolio APIs.
const http=require('node:http');
const {Client}=require('pg');
const {initialize}=require('./init-shadow.cjs');
const {loadSnapshot}=require('./import-source.cjs');
const {auditAll}=require('./replay-all.cjs');
const {compareStored}=require('./shadow-compare.cjs');
const {getLiveSnapshot,compareImported}=require('./live-sheet-check.cjs');
const {saveSummary}=require('./compare-history.cjs');
const {comparisonStats}=require('./comparison-stats.cjs');
const mode=process.env.VIXALE_V2_SHADOW_MODE;
if(mode!=='READ_ONLY')throw Error('Shadow-only mode required');
const url=process.env.VIXALE_V2_SHADOW_DATABASE_URL;
if(!url)throw Error('Internal shadow DB connection missing');
const name=new URL(url).pathname.slice(1);
if(!/^vixale_engine_v2_shadow_\d{8}$/.test(name))throw Error('Unexpected database');
const port=Number(process.env.PORT||10000);
async function inspect(){
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});
 await client.connect();
 try {
   await client.query('BEGIN READ ONLY');
   const result=await client.query("SELECT current_database() AS db, to_regnamespace('vixale_v2') IS NOT NULL AS schema_present");
   await client.query('COMMIT');
   if(result.rows[0].db!==name)throw Error('Database mismatch');
   return {connected:true,schemaPresent:result.rows[0].schema_present};
 }finally{await client.end()}
}
let last={connected:false,schemaPresent:false};
let comparison={status:'PENDING'};
let liveStatus={status:'NOT_CONFIGURED'};
let historyStats={checks:0,changed_checks:0};
const server=http.createServer((req,res)=>{
 if(req.url!=='/health'){res.writeHead(404);res.end();return}
 res.writeHead(last.connected?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({mode:'READ_ONLY',databaseConnected:last.connected,schemaInitialized:last.schemaPresent,comparisonStatus:comparison.status,sourceDate:comparison.asOf||null,sourceType:'IMPORTED_SNAPSHOT_NOT_LIVE',liveSheetStatus:liveStatus.status,liveSheetDate:liveStatus.sourceDate||null,historyChecks:historyStats.checks,historyChangedChecks:historyStats.changed_checks,historyLatestCheck:historyStats.latest_check||null}));
});
const refresh=async()=>{try{last=await inspect();if(last.connected&&last.schemaPresent){comparison=await compareStored({url});console.log('Shadow stored comparison:',JSON.stringify({status:comparison.status,asOf:comparison.asOf,realized:comparison.realized?.status,frozen:comparison.frozen?.status}));if(process.env.VIXALE_V2_GOOGLE_SERVICE_ACCOUNT_JSON){
  try{
    const live=await getLiveSnapshot({credentials:process.env.VIXALE_V2_GOOGLE_SERVICE_ACCOUNT_JSON});
    const {Client:PgClient}=require('pg');const conn=new PgClient({connectionString:url});await conn.connect();
    let imported;try{await conn.query('BEGIN READ ONLY');const q=await conn.query('SELECT payload FROM vixale_v2.source_snapshots ORDER BY received_at DESC LIMIT 1');await conn.query('COMMIT');if(!q.rows.length)throw Error('Historical import unavailable');imported=q.rows[0].payload}finally{await conn.end()}
    liveStatus={status:'PASS',...compareImported(live,imported)};
    await saveSummary(url,liveStatus);
    historyStats=await comparisonStats(url);
    console.log('Shadow LIVE Sheet comparison:',JSON.stringify({status:liveStatus.status,sourceDate:liveStatus.sourceDate,updated:liveStatus.updated,closedChanged:liveStatus.closedChanged}));
  }catch(e){liveStatus={status:'ERROR'};console.error('Shadow live Sheet read failed:',e.message)}
}}}catch(e){last={connected:false,schemaPresent:false};comparison={status:'ERROR'};console.error('Shadow database audit unavailable:',e.message)}};
(async()=>{
 try{
  if(process.env.VIXALE_V2_SHADOW_INIT==='YES'){
    const initialized=await initialize({url,allow:'YES'});
    console.log('Shadow schema initialized:',initialized.tables.length,'tables');
  }
 }catch(e){console.error('Shadow schema initialization FAILED:',e.message)}
 if(process.env.VIXALE_V2_SOURCE_IMPORT_JSON){
   const snapshot=JSON.parse(process.env.VIXALE_V2_SOURCE_IMPORT_JSON);
   const audit=auditAll(snapshot);
   if(audit.status!=='PASS')throw Error('Imported historical realized accounting failed replay');
   const imported=await loadSnapshot({url,payload:snapshot});
   console.log('Shadow historical import verified:',JSON.stringify({...imported,replayedDates:audit.dates}));
 }
 await refresh();
 server.listen(port,'0.0.0.0');
})().catch(e=>{console.error('Shadow observer startup failed:',e.message);process.exitCode=1});
setInterval(refresh,60000).unref();
