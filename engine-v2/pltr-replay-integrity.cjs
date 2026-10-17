'use strict';
// Audit point-in-time evidence chronology before any historical factor score is certified.
const ms=s=>{if(typeof s!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))throw Error('Timestamp with offset required');return Date.parse(s)};
function checkQuoteAtCutoff({quoteTime,cutoff='2026-10-12T13:48:00-04:00',price}){
 const observed=ms(quoteTime),limit=ms(cutoff);
 if(!Number.isFinite(price)||price<=0)throw Error('Valid quote required');
 return {eligible:observed<=limit,status:observed<=limit?'PRE_CUTOFF_QUOTE':'POST_CUTOFF_QUOTE_NOT_REVIEW_PROOF',lagSeconds:Math.round((observed-limit)/1000)};
}
function factorCoverage({factorEvidence={},referenceScore}){
 const caps={market:10,sector:15,leadership:15,catalyst:10,base:15,compression:10,volume:15,ma:5,resistance:5};
 const missing=Object.keys(caps).filter(k=>!factorEvidence[k]||!Number.isInteger(factorEvidence[k].points)||factorEvidence[k].points<0||factorEvidence[k].points>caps[k]||!factorEvidence[k].source||!factorEvidence[k].asOf);
 if(missing.length)return {status:'INDEPENDENT_SCORE_INCOMPLETE',missing,referenceScore};
 const sum=Object.values(factorEvidence).reduce((x,y)=>x+y.points,0);
 return {status:'EVIDENCE_ASSIGNED_SCORE',independentScore:sum,referenceScore,match:sum===referenceScore};
}
module.exports={checkQuoteAtCutoff,factorCoverage};
