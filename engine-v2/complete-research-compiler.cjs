'use strict';
// Converts independently collected OHLCV/benchmark facts plus fully sourced,
// dated analyst/agent factor assessments into the canonical nine-factor batch.
// This is an evidence assembler, not a generator of unsupported rankings.
const {normalizeDailyEvidence}=require('./daily-research-bridge.cjs');
const {validateResearchBatch}=require('./research-attestation.cjs');
const {CAPS,score}=require('./core.cjs');
const {createHash}=require('node:crypto');
function compileFullResearch({artifact,date,runAt,universe,session,assessments,newsReview}={}){
 const blocked=(reason,errors=[])=>({status:'BLOCKED',reason,errors,complete:false});
 const metrics=normalizeDailyEvidence({artifact,universe,reviewDate:date});
 if(metrics.status!=='METRICS_READY_SCORING_PENDING')return blocked('DAILY_OHLCV_NOT_CERTIFIED',metrics.errors);
 if(!Array.isArray(assessments)||assessments.length!==universe.length)return blocked('NINE_FACTOR_ASSESSMENT_COVERAGE_MISSING');
 if(!newsReview||newsReview.date!==date||newsReview.complete!==true||
    !newsReview.sourceId||!newsReview.checkedAt||!Number.isFinite(Date.parse(newsReview.checkedAt))||
    Date.parse(newsReview.checkedAt)>Date.parse(runAt))return blocked('COMPANY_NEWS_COVERAGE_UNVERIFIED');
 const map=new Map(),errors=[],items=[];
 for(const a of assessments){
  if(!a||!universe.includes(a.ticker)||map.has(a.ticker)){errors.push('DUPLICATED_OR_UNKNOWN_ASSESSMENT');continue}
  map.set(a.ticker,a);
 }
 for(const raw of metrics.items){
  const a=map.get(raw.ticker);
  if(!a){errors.push('ASSESSMENT_MISSING:'+raw.ticker);continue}
  if(a.reviewDate!==date||a.complete!==true||!a.reviewTime||
     !Number.isFinite(Date.parse(a.reviewTime))||Date.parse(a.reviewTime)>Date.parse(runAt)){
   errors.push('CURRENT_DATE_REVIEW_UNVERIFIED:'+raw.ticker);continue
  }
  if(!newsReview.tickers?.includes(raw.ticker)){errors.push('NEWS_COVERAGE_MISSING:'+raw.ticker);continue}
  const f={},facts={};let valid=true;
  for(const [factor,cap] of Object.entries(CAPS)){
   const e=a.factors?.[factor];
   if(!e||!Number.isInteger(e.points)||e.points<0||e.points>cap||
      !e.sourceId||typeof e.explanation!=='string'||e.explanation.trim().length<12||
      !e.checkedAt||!Number.isFinite(Date.parse(e.checkedAt))||Date.parse(e.checkedAt)>Date.parse(runAt)||
      e.checkedAt.slice(0,10)!==date){
    errors.push('FACTOR_EVIDENCE_INCOMPLETE:'+raw.ticker+':'+factor);valid=false;continue
   }
   f[factor]=e.points;
   facts[factor]={sourceId:e.sourceId,explanation:e.explanation,checkedAt:e.checkedAt};
  }
  if(!valid)continue;
  const total=score(f);
  if(a.score!==total){errors.push('SCORE_SUM_MISMATCH:'+raw.ticker);continue}
  // An eligible model entry needs independent documented setup authorization.
  const entryEligible=a.entryEligible===true&&typeof a.entryEvidenceId==='string'&&a.entryEvidenceId.length>0;
  if(a.entryEligible===true&&!entryEligible){errors.push('ENTRY_SETUP_EVIDENCE_MISSING:'+raw.ticker);continue}
  if(total>=70&&total<80&&entryEligible&&!a.compellingEntryEvidenceId){
   errors.push('LOW_SCORE_ENTRY_EXCEPTION_UNVERIFIED:'+raw.ticker);continue
  }
  const sourceHash=createHash('sha256').update(JSON.stringify({raw,assessment:a,newsReviewId:newsReview.sourceId})).digest('hex');
  items.push({
   ticker:raw.ticker,date,timestamp:a.reviewTime,complete:true,score:total,factors:f,factorsEvidence:facts,
   completedDailyBars:raw.completedDailyBars,lastCompletedSessionDate:raw.lastCompletedSessionDate,
   ohlcvSourceId:raw.sourceHash,newsEvidenceId:newsReview.sourceId,
   marketEvidenceId:facts.market.sourceId,sectorEvidenceId:facts.sector.sourceId,
   volumeRvol:raw.volumeRvol,exchangeVolumeVerified:true,
   ma20:raw.ma20,ma50:raw.ma50,ma200:raw.ma200,entryEligible,
   entryEvidenceId:entryEligible?a.entryEvidenceId:null,
   compellingEntryEvidenceId:a.compellingEntryEvidenceId||null,
   assessmentSourceHash:sourceHash,
   technicalFacts:{range20Pct:raw.range20Pct,high20:raw.high20,high60:raw.high60,
    return20Pct:raw.return20Pct,return60Pct:raw.return60Pct}
  });
 }
 if(errors.length)return blocked('INCOMPLETE_FACTOR_RESEARCH',errors);
 const benchmarks=['SPY','QQQ','SMH','XLK','XLE'].map(ticker=>{
  const r=artifact.data.find(x=>x.metrics?.symbol===ticker);
  return {ticker,sourceId:r?.source||null,timestamp:artifact.collectedAt||runAt};
 });
 const batch={date,runAt,universe,items,benchmarks,session};
 const validated=validateResearchBatch(batch);
 return validated.status==='PASS'?{status:'PASS',complete:true,batch}:blocked('FACTOR_ATTESTATION_FAILED',validated.errors);
}
module.exports={compileFullResearch};
