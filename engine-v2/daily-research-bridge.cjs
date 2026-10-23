'use strict';
// Convert the existing read-only daily research collector to traceable inputs.
// Do NOT invent qualitative nine-factor scores or treat a daily Yahoo quote as
// a guaranteed contemporaneous model-entry trade. Publisher must stay blocked.
const {createHash}=require('node:crypto');
const {validateResearchBatch}=require('./research-attestation.cjs');
const benchmarks=new Set(['SPY','QQQ','SMH','XLK','XLE']);
function normalizeDailyEvidence({artifact,universe,reviewDate}={}){
 const errors=[];
 if(!artifact||artifact.gate!=='RESEARCH_INPUTS'||artifact.result!=='PASS'||artifact.date!==reviewDate||!Array.isArray(artifact.data))
  return {status:'BLOCKED',errors:['INVALID_OR_STALE_RESEARCH_ARTIFACT'],items:[]};
 if(!Array.isArray(universe)||!universe.length||new Set(universe).size!==universe.length)
  return {status:'BLOCKED',errors:['MISSING_EXPLICIT_UNIVERSE'],items:[]};
 const map=new Map();
 for(const record of artifact.data){
  const m=record?.metrics,symbol=m?.symbol;
  if(!symbol||map.has(symbol)){errors.push('MISSING_OR_DUPLICATE_SYMBOL');continue}
  map.set(symbol,record);
 }
 const items=[];
 for(const ticker of universe){
  const r=map.get(ticker),m=r?.metrics;
  if(!m){errors.push('SYMBOL_NOT_COLLECTED:'+ticker);continue}
  if(m.quoteDate!==reviewDate||!Number.isInteger(m.dailyBars)||m.dailyBars<200||
     !m.lastCompleteDate||m.lastCompleteDate>=reviewDate ||
     !['sma20','sma50','sma200','lastCompleteRelativeVolume','range20Pct','high20','high60','return20Pct','return60Pct'].every(k=>Number.isFinite(m[k]))){
    errors.push('INCOMPLETE_OHLCV_METRICS:'+ticker);continue;
  }
  if(!r.source||!/^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(r.source)){
    errors.push('SOURCE_PROVENANCE_MISSING:'+ticker);continue;
  }
  const raw={ticker,date:reviewDate,lastCompletedSessionDate:m.lastCompleteDate,completedDailyBars:m.dailyBars,
   ma20:m.sma20,ma50:m.sma50,ma200:m.sma200,volumeRvol:m.lastCompleteRelativeVolume,
   lastCompletedClose:m.lastCompleteClose,upDownVolume20:m.upDownVolume20,range5Pct:m.range5Pct,
   range20Pct:m.range20Pct,high20:m.high20,high60:m.high60,return20Pct:m.return20Pct,return60Pct:m.return60Pct,
   quoteTime:m.quoteTime,quotePrice:m.price,
   sourceUrl:r.source,sourceHash:createHash('sha256').update(JSON.stringify(r)).digest('hex')};
  items.push(raw);
 }
 for(const b of benchmarks)if(!map.has(b))errors.push('BENCHMARK_MISSING:'+b);
 return {status:errors.length?'BLOCKED':'METRICS_READY_SCORING_PENDING',errors,items,
   reviewDate,scoreVerified:false,entryQuoteVerified:false};
}
function checkFullResearch({batch}={}){
 const r=validateResearchBatch(batch);
 return {status:r.status,errors:r.errors,fullNineFactorScoringVerified:r.status==='PASS'};
}
module.exports={normalizeDailyEvidence,checkFullResearch};
