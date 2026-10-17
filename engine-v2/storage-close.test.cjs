'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {transact}=require('./storage.cjs');
function poolForClose(){
 const statements=[];
 const client={
  async query(sql,args=[]){
   statements.push({sql,args});
   if(sql.startsWith('SELECT payload_hash'))return {rows:[]};
   if(sql.startsWith('SELECT lot_id'))return {rows:[{lot_id:'test-uuid',entryPrice:'1090.27',entryAt:'2026-09-23T14:00:00.000Z',exitAt:null}]};
   if(sql.startsWith('SELECT COUNT'))return {rows:[{n:1}]};
   return {rows:[],rowCount:1};
  },
  release(){statements.push({sql:'RELEASE'})}
 };
 return {pool:{connect:async()=>client},statements};
}
const event={eventId:'close-MU',type:'CLOSE',ticker:'MU',entryDate:'2026-09-23',exitPrice:997.63,exitTime:'2026-10-12T12:35:59-04:00',reason:'STOP LOSS',includePublic:'YES',effectiveDate:'2026-10-12',returnPct:-0.08496977812835349};
test('closed lot persists precise normalized model return',async()=>{
 const {pool,statements}=poolForClose();
 assert.equal((await transact({pool,event})).applied,true);
 const update=statements.find(x=>x.sql.startsWith('UPDATE vixale_v2.model_lots'));
 assert.match(update.sql,/realized_return_pct/);
 assert.ok(Math.abs(update.args[6]-event.returnPct)<1e-14);
 assert.ok(statements.some(x=>x.sql==='COMMIT'));
});
test('wrong return cannot be committed',async()=>{
 const {pool,statements}=poolForClose();
 await assert.rejects(transact({pool,event:{...event,returnPct:0.1}}),/Exit return mismatch/);
 assert.ok(statements.some(x=>x.sql==='ROLLBACK'));
 assert.ok(!statements.some(x=>x.sql==='COMMIT'));
});
