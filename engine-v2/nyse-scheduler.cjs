'use strict';
// Pure next NYSE 10:00 ET trigger; no external scheduler is activated.
const {sessionEvidence,localSessionDate}=require('./nyse-session-adapter.cjs');
function nextMorning(after=new Date()){
 if(!(after instanceof Date)||!Number.isFinite(after.getTime()))throw Error('Valid time required');
 const start=localSessionDate(after);
 for(let i=0;i<12;i++){
  const date=new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
  if(!sessionEvidence(date).isTradingDay)continue;
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(x=>x.type==='timeZoneName')?.value;
  const m=/^GMT([+-])(\d{1,2})$/.exec(zone||'');
  if(!m)throw Error('NYSE UTC offset unavailable');
  const offset=(m[1]==='-'?-1:1)*Number(m[2])*60;
  const at=new Date(Date.parse(date+'T10:00:00Z')-offset*60000);
  if(at>after)return {date,at:at.toISOString(),sourceId:sessionEvidence(date).sourceId};
 }
 throw Error('No maintained NYSE session in horizon');
}
module.exports={nextMorning};
