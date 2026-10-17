'use strict';
// Shadow-only, pure exclusion proposal. Does not mutate input, databases, or canonical Sheets.
const keyOf = lot => String(lot?.ticker || '') + '|' + String(lot?.entryDate || '');
function proposeExclusions({closed=[],active=[],discrepancies=[]}={}) {
 if(!Array.isArray(closed)||!Array.isArray(active)||!Array.isArray(discrepancies)) throw Error('Arrays required');
 const lots=[...closed,...active], index=new Map();
 for(const lot of lots){const key=keyOf(lot);if(!lot.ticker||!/^\d{4}-\d{2}-\d{2}$/.test(lot.entryDate)||index.has(key))throw Error('Invalid or duplicate lot: '+key);index.set(key,lot)}
 const accepted=[],blocked=[];
 for(const d of discrepancies){
  const key=String(d?.lotId||'');
  const reason=String(d?.reason||'').trim();
  const evidence=Array.isArray(d?.evidenceIds)?d.evidenceIds.filter(x=>typeof x==='string'&&x.trim()):[];
  if(!index.has(key)||!reason||!evidence.length||d.confirmed!==true){blocked.push({lotId:key||null,reason:'NOT_CONFIRMED_OR_UNATTRIBUTED'});continue}
  accepted.push({lotId:key,reason,evidenceIds:[...new Set(evidence)]});
 }
 const excluded=new Set(accepted.map(x=>x.lotId));
 return {status:blocked.length?'REVIEW_REQUIRED':'PROPOSED_ONLY',proposed:accepted,blocked,closed:closed.filter(x=>!excluded.has(keyOf(x))),active:active.filter(x=>!excluded.has(keyOf(x))),excludedCount:excluded.size,mutated:false,certified:false};
}
module.exports={keyOf,proposeExclusions};
