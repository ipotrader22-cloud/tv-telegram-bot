'use strict';
// Google-only carried-lot historical target scan. Owner's 09:31 first minute
// convention applies ONLY to minute targets. The 09:30 opening STOP remains
// separately validated against the completed daily session OPEN.
const {createHash}=require('node:crypto');
const {localET}=require('./market-data-adapter.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {etTime}=require('./delayed-model-policy.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function googleHistoricalExit({position,through,bars,dailyBars,dailyEvidence}={}){
 const from=position?.lastTargetCheckedAt||position?.entryTime;
 const start=Date.parse(from||''),end=Date.parse(through||''),entry=Date.parse(position?.entryTime||'');
 if(!position||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(position.ticker||'')||
    !Number.isFinite(position.entryPrice)||position.entryPrice<=0||
    !Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(entry))
  throw Error('TARGET_POSITION_OR_TIME_EVIDENCE_MISSING');
 if(start<entry||end<=entry||start>end||end-start>7*86400000)
  throw Error('TARGET_WINDOW_OUTSIDE_AVAILABLE_MINUTE_HISTORY');
 if(!Array.isArray(bars)||!Array.isArray(dailyBars))throw Error('GOOGLE_TARGET_EVIDENCE_INVALID');
 // Only a certified, completed Google daily series may prove that a target
 // was impossible. It never supplies the time of a positive target touch.
 const certified=dailyEvidence?.source==='GOOGLE_FINANCE_CHART_1DAY'&&
  dailyEvidence.metrics?.symbol===position.ticker&&
  /^20\d\d-\d\d-\d\d$/.test(dailyEvidence.metrics?.lastCompleteDate||'')&&
  /^[a-f0-9]{64}$/.test(dailyEvidence.rawHash||'')&&
  hash(dailyEvidence.bars)===hash(dailyBars);
 const index=new Map(),daily=new Map();
 for(const d of dailyBars){
  if(!d||!/^20\d\d-\d\d-\d\d$/.test(d.date||'')||daily.has(d.date)||
     !Number.isFinite(d.open)||d.open<=0)
   throw Error('GOOGLE_HISTORICAL_OPEN_INVALID');
  daily.set(d.date,d);
 }
 for(const b of bars){
  if(b?.ticker!==position.ticker||b.provider!=='GOOGLE_FINANCE_CHART'||
     !/^GOOGLE_CHART_1M:/.test(b.sourceId||'')||
     !Number.isFinite(Date.parse(b.start||''))||
     b.end!==new Date(Date.parse(b.start)+60000).toISOString()||
     !Number.isFinite(b.high)||b.high<=0)
   throw Error('GOOGLE_TARGET_EVIDENCE_INVALID');
  const ts=Date.parse(b.start);
  if(index.has(ts))throw Error('GOOGLE_CHART_DUPLICATE_BAR');
  index.set(ts,b);
 }
 const checkpoints=[],calendar=new Map();
 let minuteCoverage=0;
 for(let t=Math.ceil(start/60000)*60000;t<end;t+=60000){
  const time=new Date(t).toISOString(),et=localET(time);
  if(!calendar.has(et.date))calendar.set(et.date,sessionEvidence(et.date));
  const session=calendar.get(et.date);
  if(!session.isTradingDay)continue;
  const [hh,mm]=String(session.closeEt||'16:00').split(':').map(Number);
  const close=hh*60+mm;
  if(et.minute<570||et.minute>=close)continue;
  if(et.minute===570){
   // Exact historical opening is available as yesterday's certified 1d
   // Google OPEN. A missing 09:30 minute candle cannot suppress STOP.
   if(position.entryDate<et.date&&entry<t){
    const d=daily.get(et.date);
    if(!d)throw Error('GOOGLE_HISTORICAL_OPEN_MISSING');
    if(d.open<=position.entryPrice*.95)
     checkpoints.push({reason:'STOP LOSS',at:t,ticker:position.ticker,
      sourceId:'GOOGLE_CHART_1D_OPEN:'+position.ticker+':'+et.date+':'+hash(d),
      triggerPriceKind:'DAILY_SESSION_OPEN'});
   }
   continue;
  }
  const b=index.get(t),d=daily.get(et.date);
  const completeClose=Date.parse(etTime(et.date,close));
  const negativeDaily=certified&&d&&et.date<=dailyEvidence.metrics.lastCompleteDate&&
   completeClose<=end&&[d.open,d.high,d.low,d.close,d.volume].every(Number.isFinite)&&
   d.low>0&&d.volume>=0&&d.high>=Math.max(d.open,d.close,d.low)&&
   d.low<=Math.min(d.open,d.close)&&d.high+1e-9<position.entryPrice*1.1;
  if(negativeDaily){
   if(b&&b.high>d.high+1e-9)throw Error('GOOGLE_DAILY_MINUTE_EVIDENCE_CONFLICT');
   minuteCoverage++;continue;
  }
  if(!b)throw Error('GOOGLE_MINUTE_COVERAGE_GAP');
  minuteCoverage++;
  if(b.high+1e-9>=position.entryPrice*1.1)
   checkpoints.push({reason:'TARGET',at:t,ticker:position.ticker,
    sourceId:b.sourceId,triggerPriceKind:'MINUTE_BAR_HIGH'});
 }
 if(!minuteCoverage)throw Error('GOOGLE_MINUTE_COVERAGE_EMPTY');
 checkpoints.sort((a,b)=>a.at-b.at||a.reason.localeCompare(b.reason));
 const first=checkpoints[0];
 if(!first)return null;
 return {ticker:position.ticker,entryDate:position.entryDate,reason:first.reason,
  triggerAt:first.reason==='TARGET'?new Date(first.at+60000).toISOString():new Date(first.at).toISOString(),
  sourceId:first.sourceId,triggerPriceKind:first.triggerPriceKind,
  ambiguousSameBar:false,checkedThrough:through};
}
module.exports={googleHistoricalExit};
