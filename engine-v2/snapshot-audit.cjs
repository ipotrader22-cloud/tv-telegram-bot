'use strict';
// Conservative historical audit: returns UNVERIFIED where event timestamps are missing.
const assert=(x,m)=>{if(!x)throw Error(m)};
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const amount=x=>typeof x==='number'&&Number.isFinite(x);
function auditSnapshots({closed,active,marks,asOf,tolerance=0.015}){
 assert(Array.isArray(closed)&&Array.isArray(active)&&Array.isArray(marks),'Ledgers and marks required');
 assert(date(asOf),'As-of date required');
 const errors=[],unverified=[],reports=[];
 const seen=new Set();
 for(const x of [...closed,...active]){
  const k=x.ticker+'|'+x.entryDate;
  assert(x.ticker&&date(x.entryDate)&&!seen.has(k),'Duplicate/invalid lot '+k);seen.add(k);
 }
 for(const m of marks){
  if(!date(m.date)||m.date>asOf)continue;
  const issues=[];
  if(![m.realized,m.unrealized,m.total,m.equity].every(amount)){
   unverified.push({date:m.date,gate:'MISSING_NUMERIC_FROZEN_MARK'});continue;
  }
  if(Math.abs(m.realized+m.unrealized-m.total)>tolerance)issues.push('TOTAL_FORMULA');
  if(Math.abs(100000+m.total-m.equity)>tolerance)issues.push('EQUITY_FORMULA');
  const definitelyOpen=active.filter(l=>l.entryDate<m.date).length+
    closed.filter(l=>l.entryDate<m.date&&l.exitDate>m.date).length;
  const openedToday=[...active,...closed].filter(l=>l.entryDate===m.date).length;
  const closedToday=closed.filter(l=>l.exitDate===m.date&&l.entryDate<m.date).length;
  const minimum=definitelyOpen;
  const maximum=definitelyOpen+openedToday+closedToday;
  const membershipKnown=openedToday===0&&closedToday===0;
  if(!Number.isInteger(m.activeCount))unverified.push({date:m.date,gate:'MISSING_ACTIVE_COUNT'});
  else if(m.activeCount<minimum||m.activeCount>maximum)unverified.push({date:m.date,gate:'MEMBERSHIP_SOURCE_INCOMPLETE',observed:m.activeCount,derivedMin:minimum,derivedMax:maximum});
  else if(!membershipKnown)unverified.push({date:m.date,gate:'INTRADAY_MEMBERSHIP_TIMING_NOT_RECONSTRUCTIBLE'});
  if(issues.length)errors.push({date:m.date,issues});
  reports.push({date:m.date,recordedActive:m.activeCount,minimum,maximum,issues});
 }
 return {status:errors.length?'FAIL':unverified.length?'PARTIAL':'PASS',errors,unverified,reports,scope:'FROZEN_FORMULAS_AND_BOUNDED_MEMBERSHIP'};
}
module.exports={auditSnapshots};
