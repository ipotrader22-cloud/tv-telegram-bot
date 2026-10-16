'use strict';
// Safe, idempotent initializer for an explicitly isolated Engine V2 shadow DB.
// Does not DROP anything; never points at the canonical workbook or website.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Client}=require('pg');
async function initialize({url=process.env.VIXALE_V2_SHADOW_DATABASE_URL,allow=process.env.VIXALE_V2_SHADOW_INIT}={}){
 if(allow!=='YES')throw Error('Explicit VIXALE_V2_SHADOW_INIT=YES required');
 if(!url||!url.startsWith('postgres'))throw Error('Shadow database URL missing');
 const db=new URL(url).pathname.slice(1);
 if(!/^vixale_engine_v2_shadow_\d{8}$/.test(db))throw Error('Refusing unexpected database name');
 const client=new Client({connectionString:url});
 await client.connect();
 try{
  const actual=(await client.query('SELECT current_database() AS db')).rows[0].db;
  if(actual!==db)throw Error('Connected database name mismatch');
  const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
  const checksum=crypto.createHash('sha256').update(schema).digest('hex');
  await client.query(schema);
  const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='vixale_v2' ORDER BY table_name");
  return {database:actual,schemaChecksum:checksum,tables:tables.rows.map(r=>r.table_name)};
 }finally{await client.end()}
}
module.exports={initialize};
if(require.main===module)initialize().then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1});
