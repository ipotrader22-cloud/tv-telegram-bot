'use strict';
// Runs only when VIXALE_V2_TEST_DATABASE_URL points to a disposable PostgreSQL database.
// NEVER point this at the live portfolio, an existing application database, or production.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Client,Pool}=require('pg');
const {transact}=require('./storage.cjs');
const uri=process.env.VIXALE_V2_TEST_DATABASE_URL;
test('isolated PostgreSQL integration: real rollback, unique lots and idempotency',{skip:!uri},async()=>{
 const administration=new Client({connectionString:uri});await administration.connect();
 const pool=new Pool({connectionString:uri,max:2});
 try{
  await administration.query('DROP SCHEMA IF EXISTS vixale_v2 CASCADE');
  await administration.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  const opening={eventId:'integration-open',type:'OPEN',ticker:'TEST',entryDate:'2026-10-16',entryTime:'2026-10-16T10:00:00-04:00',entryPrice:100,entryScore:85};
  assert.equal((await transact({pool,event:opening})).applied,true);
  assert.equal((await transact({pool,event:opening})).applied,false);
  await assert.rejects(transact({pool,event:{...opening,entryPrice:111}}),/Conflicting event replay/);
  const closing={eventId:'integration-close',type:'CLOSE',ticker:'TEST',entryDate:'2026-10-16',exitTime:'2026-10-16T11:00:00-04:00',exitPrice:110,returnPct:0.1,reason:'TARGET',includePublic:'YES',effectiveDate:'2026-10-16'};
  assert.equal((await transact({pool,event:closing})).applied,true);
  assert.equal((await transact({pool,event:closing})).applied,false);
  const rows=await administration.query('SELECT realized_return_pct,include_public FROM vixale_v2.model_lots');
  assert.equal(rows.rowCount,1);
  assert.equal(rows.rows[0].include_public,'YES');
  assert.equal(Number(rows.rows[0].realized_return_pct),0.1);
  const n=await administration.query('SELECT COUNT(*)::int n FROM vixale_v2.model_events');assert.equal(n.rows[0].n,2);
 }finally{await pool.end();await administration.query('DROP SCHEMA IF EXISTS vixale_v2 CASCADE');await administration.end()}
});
