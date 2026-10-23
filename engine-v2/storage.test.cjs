'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {transact}=require('./storage.cjs');
function fakePool({failOnInsert=false}={}){
 const log=[];
 const client={async query(sql,args=[]){
  log.push(sql);
  if(sql.startsWith('SELECT payload_hash'))return {rows:[]};
  if(sql.startsWith('SELECT lot_id'))return {rows:[]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{n:0}]};
  if(failOnInsert&&sql.startsWith('INSERT'))throw Error('injected database failure');
  return {rows:[]};
 },release(){log.push('RELEASE')}};
 return {pool:{connect:async()=>client},log};
}
const event={eventId:'test-open',type:'OPEN',ticker:'PLTR',entryDate:'2026-10-16',entryTime:'2026-10-16T10:00:00-04:00',entryPrice:100,entryScore:85};
test('shadow mode commits isolated valid OPEN and releases client',async()=>{
 const {pool,log}=fakePool();
 assert.equal((await transact({pool,event})).applied,true);
 assert.ok(log.includes('COMMIT'));assert.equal(log.at(-1),'RELEASE');
 assert.equal(log.filter(x=>x.startsWith('INSERT')).length,2);
});
test('database failure rolls back all writes',async()=>{
 const {pool,log}=fakePool({failOnInsert:true});
 await assert.rejects(transact({pool,event}),/injected/);
 assert.ok(log.includes('ROLLBACK'));assert.ok(!log.includes('COMMIT'));assert.equal(log.at(-1),'RELEASE');
});
test('production mode explicitly prohibited',async()=>{
 const {pool,log}=fakePool();
 await assert.rejects(transact({pool,event,shadowOnly:false}),/Production writes disabled/);
 assert.equal(log.length,0);
});
