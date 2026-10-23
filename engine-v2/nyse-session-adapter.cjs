'use strict';
// Reuse the existing independently maintained 2026–2028 NYSE calendar.
// No new scheduler or synthetic market-session claim is created by this adapter.
const {session}=require('../scripts/swing-market-calendar');
function sessionEvidence(date,{source='NYSE_CALENDAR_REPO_V1'}={}){
 const value=session(date);
 return {date,isTradingDay:value.open,providerVerified:true,sourceId:source,closeEt:value.closeEt};
}
function localSessionDate(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
module.exports={sessionEvidence,localSessionDate};
