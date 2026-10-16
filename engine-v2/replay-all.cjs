'use strict';
// Read-only, deterministic audit over an explicitly supplied workbook export.
// Input JSON {closed:[{ticker,entryDate,exitDate,entryPrice,exitPrice,returnPct,includePublic,effectiveDate}], equity:[{date,realized,unrealized,equity,activeCount}], active?:[] }.
// This DOES NOT fetch Google Sheets or change any account.
const {replay}=require('./replay.cjs');
const assert=(x,m)=>{if(!x)throw Error(m)};
function auditAll(input,{tolerance=0.00001}={}){
 assert(Array.isArray(input?.closed)&&Array.isArray(input?.equity),'Closed ledger and equity snapshots required');
 const dates=input.equity.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
 const result=[];
 const unique=new Set();
 for(const c of input.closed){
  const k=c.ticker+'|'+c.entryDate;assert(!unique.has(k),'Duplicate lot '+k);unique.add(k);
  assert(Number.isFinite(c.returnPct),'Canonical raw L numeric return required: '+k);
  assert(['YES','NO'].includes(c.includePublic),'Canonical Q required: '+k);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(c.effectiveDate),'Canonical R required: '+k);
 }
 for(const mark of dates){
  if(mark.date==='2026-08-21')continue; // inception has no realized numeric snapshot
  assert(Number.isFinite(mark.realized),'Canonical Equity History C required for '+mark.date);
  const r=replay({closed:input.closed,asOf:mark.date});
  const delta=r.realized-mark.realized;
  result.push({date:mark.date,replayed:r.realized,canonical:mark.realized,delta,pass:Math.abs(delta)<=tolerance});
 }
 return {status:result.length>0&&result.every(r=>r.pass)?'PASS':'BLOCKED',dates:result.length,failed:result.filter(r=>!r.pass),results:result,scope:'REALIZED_PNL_ONLY'};
}
module.exports={auditAll};
if(require.main===module){
 const fs=require('node:fs');assert(process.argv.length===3,'Usage: node replay-all.cjs /path/to/read-only-export.json');
 const out=auditAll(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 console.log(JSON.stringify(out,null,2));if(out.status!=='PASS')process.exitCode=1;
}
