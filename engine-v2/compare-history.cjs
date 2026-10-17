'use strict';
const {Client}=require('pg');
async function saveSummary(url,s){
 if(!/^vixale_engine_v2_shadow_\d{8}$/.test(new URL(url).pathname.slice(1)))throw Error('Unexpected database');
 if(s?.source!=='GOOGLE_SHEETS_READONLY'||s.realizedMatches!==true)throw Error('Unverified comparison');
 const db=new Client({connectionString:url});await db.connect();
 try{
 await db.query('BEGIN');
 await db.query('CREATE TABLE IF NOT EXISTS vixale_v2.shadow_comparison_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, checked_at timestamptz DEFAULT now(), source_date date NOT NULL, baseline_date date NOT NULL, closed_changed integer NOT NULL, active_count integer NOT NULL, accounting_pass boolean NOT NULL)');
 await db.query('INSERT INTO vixale_v2.shadow_comparison_history(source_date,baseline_date,closed_changed,active_count,accounting_pass) VALUES($1,$2,$3,$4,$5)',[s.sourceDate,s.previousDate,s.closedChanged,s.activeTickers.length,true]);
 await db.query('COMMIT');return {saved:true};
 }catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
}
module.exports={saveSummary};
