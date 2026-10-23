'use strict';
// Assemble dated nine-factor research without generating scores or source claims.
const {validateResearchBatch}=require('./research-attestation.cjs');
const {CAPS,score}=require('./core.cjs');
function datedResearchProvider({universe,benchmarksProvider,reviewProvider}={}){
 if(!Array.isArray(universe)||!universe.length||typeof benchmarksProvider!=='function'||typeof reviewProvider!=='function')throw Error('Research sources and declared universe required');
 return {async getBatch({date,runAt,session}={}){
  const benchmarks=await benchmarksProvider({date,runAt,session});
  const items=[];
  for(const ticker of universe){
   const item=await reviewProvider({ticker,date,runAt,session});
   if(item?.ticker!==ticker||item?.date!==date)throw Error('Dated research missing for '+ticker);
   for(const key of Object.keys(CAPS)){
    const e=item.factorsEvidence?.[key];
    if(!e?.sourceId||!e?.explanation||!e?.date||e.date>date)throw Error('Undated factor evidence: '+ticker+':'+key);
   }
   if(score(item.factors)!==item.score)throw Error('Research score mismatch: '+ticker);
   items.push(item);
  }
  const batch={date,runAt,session,universe:[...universe],benchmarks,items};
  const proof=validateResearchBatch(batch);
  if(proof.status!=='PASS')throw Error('Nine-factor research blocked: '+proof.errors.join(','));
  return batch;
 }};
}
module.exports={datedResearchProvider};
