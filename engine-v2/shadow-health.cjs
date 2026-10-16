'use strict';
// Separate shadow-only service: no trading writes, no portfolio APIs.
const http=require('node:http');
const {Client}=require('pg');
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
const server=http.createServer((req,res)=>{
 if(req.url!=='/health'){res.writeHead(404);res.end();return}
 res.writeHead(last.connected?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({mode:'READ_ONLY',databaseConnected:last.connected,schemaInitialized:last.schemaPresent}));
});
const refresh=async()=>{try{last=await inspect()}catch(e){last={connected:false,schemaPresent:false};console.error('Shadow database unavailable:',e.message)}};
refresh().then(()=>server.listen(port,'0.0.0.0'));
setInterval(refresh,60000).unref();
