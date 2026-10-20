'use strict';
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {localET}=require('./market-data-adapter.cjs');
function validateMorningTrigger({date,runAt}={}){
 const bad=reason=>({status:'BLOCKED',reason});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(runAt||'')))return bad('INVALID_DATE_OR_TIMESTAMP');
 let s;try{s=sessionEvidence(date)}catch{return bad('NYSE_CALENDAR_UNMAINTAINED')}
 if(!s.isTradingDay)return bad('NYSE_CLOSED');
 const et=localET(runAt);
 if(et.date!==date)return bad('SESSION_DATE_MISMATCH');
 if(et.minute<600||et.minute>605)return bad('OUTSIDE_1000_ET_WINDOW');
 return {status:'PASS',date,sourceId:s.sourceId};
}
module.exports={validateMorningTrigger};
