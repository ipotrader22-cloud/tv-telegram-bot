'use strict';
// Verify every regular-session minute since the preceding certified scan.
// The durable watermark closes the overnight gap without rescanning old data.
const {completedBars}=require('./yahoo-minute-fallback.cjs');
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
function verifyTargetWindow(raw,{position,runAt}){
 const from=position.lastTargetCheckedAt||position.entryTime,start=Date.parse(from),end=Math.floor(Date.parse(runAt)/60000)*60000;
 if(!Number.isFinite(start)||start< Date.parse(position.entryTime)||end<start||end-start>7*86400000)throw Error('TARGET_WINDOW_OUTSIDE_AVAILABLE_MINUTE_HISTORY');
 const dates=new Set();for(let t=Math.floor(start/60000)*60000;t<end;t+=86400000)dates.add(localET(new Date(t).toISOString()).date);
 dates.add(localET(new Date(end).toISOString()).date);
 const bars=[...dates].flatMap(date=>completedBars(raw,{ticker:position.ticker,date,asOf:runAt}));
 const index=new Map(bars.map(b=>[Date.parse(b.start),b])),calendar=new Map();let peak=null;
 for(let t=Math.ceil(start/60000)*60000;t<end;t+=60000){
  const et=localET(new Date(t).toISOString());
  if(!calendar.has(et.date))calendar.set(et.date,sessionEvidence(et.date));
  const session=calendar.get(et.date),close=session.closeEt?.split(':').map(Number);
  if(!session.isTradingDay||et.minute<570||et.minute>=close[0]*60+close[1])continue;
  const b=index.get(t);if(!b)throw Error('TARGET_MINUTE_COVERAGE_GAP');
  // Keep the earliest proven touch, not a later maximum, for exit chronology.
  if(!peak||((peak.high<Math.round(position.entryPrice*1.1*1e8)/1e8)&&b.high>peak.high))peak=b;
 }
 if(!peak)throw Error('TARGET_MINUTE_COVERAGE_EMPTY');
 return {ticker:position.ticker,confirmed:true,session:'REGULAR',high:peak.high,time:peak.end,sourceId:peak.sourceId,
  priceKind:'MINUTE_BAR_HIGH',indicative:true,completeCoverage:true,coverageFrom:from,checkedThrough:new Date(end).toISOString()};
}
function createTargetWindowProvider({fetchFn=fetch}={}){
 return {async getTargets({runAt,positions}){
  return Promise.all(positions.map(async position=>{
   const from=position.lastTargetCheckedAt||position.entryTime;
   if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(position.ticker)||!Number.isFinite(Date.parse(from))||Date.parse(runAt)-Date.parse(from)>7*86400000)throw Error('TARGET_WINDOW_OUTSIDE_AVAILABLE_MINUTE_HISTORY');
   const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(position.ticker)+'?interval=1m&period1='+Math.floor(Date.parse(from)/1000)+'&period2='+Math.ceil(Date.parse(runAt)/1000);
   const r=await fetchFn(url,{headers:{'Cache-Control':'no-cache','User-Agent':'VixaleResearch/2.0'},signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('TARGET_HISTORY_HTTP_'+r.status);
   return verifyTargetWindow(await r.json(),{position,runAt});
  }));
 }};
}
module.exports={verifyTargetWindow,createTargetWindowProvider};
