'use strict';
// Prospective owner rule. Historical delayed commits are recomputed on read;
// keep their original selection semantics so immutable evidence still validates.
const EFFECTIVE_DATE='2026-11-16';
const POLICY='SCORE_ABOVE_70_TEN_FIXED_10K_V1';
const scoreOnly=date=>typeof date==='string'&&date>=EFFECTIVE_DATE;
function eligible(item,date){
 if(scoreOnly(date))return Number.isInteger(item.score)&&item.score>70&&item.score<=100;
 return item.score>=70&&item.entryEligible===true&&Boolean(item.entryEvidenceId)&&
  (item.score>=80||Boolean(item.compellingEntryEvidenceId));
}
function candidates(items,{date,active=[],closed=[]}={}){
 // Prior closed lots remain immutable, but do not ban the ticker forever.
 // Block same-day exits/reused lot IDs to prevent churn and duplicate events.
 const excluded=new Set([...active,...closed.filter(p=>!scoreOnly(date)||
  p.exitDate===date||p.effectiveDate===date||p.entryDate===date)].map(p=>p.ticker));
 return items.filter(x=>eligible(x,date)&&!excluded.has(x.ticker))
  .sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker));
}
module.exports={EFFECTIVE_DATE,POLICY,scoreOnly,eligible,candidates};
