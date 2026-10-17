'use strict';
// Cutoff for the actual 2026-10-12 13:48 ET research: only completed bars through Oct 9.
// A publication date of Oct 12 alone is not proof it was accessible before 13:48 ET.
const cutoff='2026-10-12T13:48:00-04:00';
const lastSession='2026-10-09';
function gatePublication(event){
 if(!event||typeof event.url!=='string'||!event.url.startsWith('https://'))return {status:'REJECTED',reason:'SOURCE_REQUIRED'};
 if(typeof event.publishedAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(event.publishedAt)||!Number.isFinite(Date.parse(event.publishedAt)))return {status:'UNVERIFIED_TIME',reason:'PUBLICATION_TIMESTAMP_REQUIRED'};
 const ts=Date.parse(event.publishedAt);
 if(ts>Date.parse(cutoff))return {status:'EXCLUDED',reason:'AFTER_HISTORICAL_CUTOFF'};
 return {status:'TIME_ELIGIBLE_REQUIRES_CONTENT_VERIFICATION',cutoff};
}
function gateDailyBars(bars){
 if(!Array.isArray(bars)||bars.length<200)throw Error('Requires >=200 completed daily sessions');
 let prev='';
 for(const b of bars) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||b.day>lastSession||b.day<=prev)throw Error('Uncompleted, future or unordered bars');
  if(![b.open,b.high,b.low,b.close,b.volume].every(x=>Number.isFinite(x)&&x>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error('Invalid OHLCV');
  prev=b.day;
 }
 if(bars.at(-1).day!==lastSession)throw Error('Historical daily series is stale');
 return {status:'COMPLETED_PRE_CUTOFF',asOf:lastSession,count:bars.length};
}
module.exports={gatePublication,gateDailyBars,cutoff,lastSession};
