'use strict';
// Read-only historical ledger reconciliation; never alters source records.
const {pnl}=require('./core.cjs');
const ok=(v,m)=>{if(!v)throw Error(m)};
function parseMoney(s){
 if(typeof s==='number')return s;
 ok(typeof s==='string','Money missing');
 const negative=/^\(.*\)$/.test(s.trim());
 const value=Number(s.replace(/[$,()\s]/g,''));
 ok(Number.isFinite(value),'Money invalid');
 return negative?-value:value;
}
function replay({closed,active=[],equity=[],asOf}){
 ok(/^\d{4}-\d\d-\d\d$/.test(asOf),'Invalid replay date');
 const seen=new Set(),events=[],warnings=[];
 let realized=0,unrealized=0;
 for(const x of closed){
  const id=x.ticker+'|'+x.entryDate;ok(x.ticker&&x.entryDate&&x.exitDate&&!seen.has(id),'Duplicate/invalid historical lot '+id);seen.add(id);
  ok(['YES','NO'].includes(x.includePublic),'Missing Q for '+id);
  const entry=parseMoney(x.entryPrice),exit=parseMoney(x.exitPrice);
  const modelPnl=pnl(entry,exit);
  events.push({id,exitDate:x.exitDate,reason:x.reason,includePublic:x.includePublic,effectiveDate:x.effectiveDate,modelPnl});
  if(x.includePublic==='YES'&&x.effectiveDate<=asOf)realized+=modelPnl;
 }
 const activeIds=new Set();
 for(const a of active){
  const id=a.ticker+'|'+a.entryDate;
  ok(!seen.has(id)&&!activeIds.has(id),'Open/closed overlap '+id);
  activeIds.add(id);unrealized+=pnl(parseMoney(a.entryPrice),parseMoney(a.price));
 }
 const marks=equity.filter(x=>x.date<=asOf).map(x=>{
  const recorded=parseMoney(x.equity);
  ok(Number.isFinite(recorded),'Missing equity snapshot');
  return {...x,equity:recorded};
 });
 const target=marks.find(x=>x.date===asOf);
 if(target&&active.length){
  const theoretical=100000+realized+unrealized;
  if(Math.abs(theoretical-target.equity)>0.02)warnings.push({gate:'VALUATION_TIME_MISMATCH',recorded:target.equity,recomputed:theoretical,note:'Live prices and frozen marks may have different as-of times'});
 }
 return {asOf,closedCount:events.length,excludedCount:events.filter(x=>x.includePublic==='NO').length,activeCount:active.length,realized,unrealized:active.length?unrealized:null,marks,warnings,events};
}
module.exports={parseMoney,replay};
