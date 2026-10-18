'use strict';
// Engine 2.0 input attestation: a review is not complete just because positions=[].
// No third-party payload may self-certify delivery or model publication.
const {score,CAPS}=require('./core.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const iso=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
function validateResearchBatch({date,runAt,universe,items,benchmarks,session}={}){
 const errors=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date<EPOCH)errors.push('INVALID_DATE');
 if(!iso(runAt))errors.push('INVALID_RUN_TIME');
 if(session?.date!==date||session?.providerVerified!==true||session?.isTradingDay!==true)errors.push('SESSION_UNVERIFIED');
 if(!Array.isArray(universe)||universe.length===0||new Set(universe).size!==universe.length||universe.some(t=>!/^[A-Z.-]+$/.test(t)))errors.push('UNIVERSE_NOT_DECLARED');
 if(!Array.isArray(benchmarks)||!benchmarks.length||benchmarks.some(b=>!b?.sourceId||!iso(b.timestamp)))errors.push('BENCHMARKS_UNVERIFIED');
 if(!Array.isArray(items))errors.push('MISSING_RESEARCH');
 const indexed=new Map();
 for(const item of Array.isArray(items)?items:[]){
   if(!item||indexed.has(item.ticker)){errors.push('DUPLICATE_OR_INVALID_RESEARCH');continue}
   indexed.set(item.ticker,item);
   if(!universe?.includes(item.ticker))errors.push('UNDECLARED_TICKER:'+item.ticker);
   if(item.complete!==true||item.date!==date||!iso(item.timestamp)||!iso(runAt)||Date.parse(item.timestamp)>Date.parse(runAt))errors.push('RESEARCH_NOT_CURRENT:'+item.ticker);
   if(!Number.isInteger(item.completedDailyBars)||item.completedDailyBars<200||!item.lastCompletedSessionDate||item.lastCompletedSessionDate>=date)errors.push('INSUFFICIENT_DATED_OHLCV:'+item.ticker);
   if(!item.ohlcvSourceId||!item.newsEvidenceId||!item.marketEvidenceId||!item.sectorEvidenceId)errors.push('MISSING_FACTOR_PROVENANCE:'+item.ticker);
   if(!Number.isFinite(item.volumeRvol)||item.volumeRvol<=0||item.exchangeVolumeVerified!==true)errors.push('UNVERIFIED_EXCHANGE_VOLUME:'+item.ticker);
   if(!['ma20','ma50','ma200'].every(k=>Number.isFinite(item[k])&&item[k]>0))errors.push('MISSING_MA:'+item.ticker);
   try{if(score(item.factors)!==item.score)errors.push('FACTOR_SUM_MISMATCH:'+item.ticker)}catch{errors.push('FACTOR_CAP_INVALID:'+item.ticker)}
   if(!item.factorsEvidence||Object.keys(CAPS).some(k=>!item.factorsEvidence[k]?.sourceId||!item.factorsEvidence[k]?.explanation))errors.push('NINE_FACTOR_EVIDENCE_INCOMPLETE:'+item.ticker);
 }
 if(Array.isArray(universe))for(const ticker of universe)if(!indexed.has(ticker))errors.push('UNREVIEWED_TICKER:'+ticker);
 return {status:errors.length?'BLOCKED':'PASS',errors,coverage: indexed.size,required:universe?.length||0,date,verifiedAt:runAt||null};
}
module.exports={validateResearchBatch};
