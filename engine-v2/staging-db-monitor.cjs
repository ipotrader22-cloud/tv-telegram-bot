'use strict';
// Log one sanitized read-only journal receipt per new morning snapshot/state.
// Unlike a public diagnostic endpoint, this stays inside the isolated observer.
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {auditStagingDb}=require('./staging-db-integrity.cjs');
function morningAuditSlot(now){
 const et=localET(now);
 if(et.minute<605||et.minute>625||et.minute%5!==0)return null;
 try{return sessionEvidence(et.date).isTradingDay?et.date:null}catch{return null}
}
function createMorningDbAuditMonitor({url,clock=()=>new Date(),audit=auditStagingDb,log=console.log}={}){
 let lastKey=null,flight=null;
 return async()=>{
  const date=morningAuditSlot(clock().toISOString());
  if(!date)return {status:'SKIPPED'};
  if(flight)return flight;
  flight=(async()=>{
   let receipt;
   try{receipt=await audit({url,date});}
   catch{receipt={status:'BLOCKED',reason:'STAGING_READ_ONLY_AUDIT_UNAVAILABLE',writesPerformed:false}}
   // Do not expose raw DB errors, URLs, source payloads or credentials.
   if(!receipt||!['PASS','BLOCKED'].includes(receipt.status))
    receipt={status:'BLOCKED',reason:'STAGING_READ_ONLY_AUDIT_UNAVAILABLE',writesPerformed:false};
   const key=date+'|'+receipt.status+'|'+(receipt.snapshotId||receipt.reason);
   if(key!==lastKey){lastKey=key;log('Engine 2 timed staging DB integrity (read only):',JSON.stringify(receipt))}
   return receipt;
  })().finally(()=>{flight=null});
  return flight;
 };
}
module.exports={morningAuditSlot,createMorningDbAuditMonitor};
