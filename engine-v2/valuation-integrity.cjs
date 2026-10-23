'use strict';
// Fail closed: missing/nonfinite quotes cannot be converted into $0 valuation.
const finitePositive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const lotKey=x=>String(x.ticker)+'|'+String(x.entryDate);
function auditValuation(active,{capital=100000}={}){
 if(!Array.isArray(active))throw Error('Active positions array required');
 const errors=[],seen=new Set();
 let invested=0,marketValue=0;
 for(const l of active){
  const key=lotKey(l);
  if(seen.has(key))errors.push({key,gate:'DUPLICATE_LOT'});
  seen.add(key);
  if(!finitePositive(l.shares)||!finitePositive(l.entryPrice)){errors.push({key,gate:'INVALID_COST_INPUT'});continue}
  invested+=l.shares*l.entryPrice;
  if(!finitePositive(l.price)){errors.push({key,gate:'MISSING_OR_INVALID_MARKET_QUOTE'});continue}
  marketValue+=l.shares*l.price;
 }
 if(errors.length)return {status:'BLOCKED',errors,marketValue:null,unrealized:null,capital,calculated:false};
 return {status:'PASS',errors,marketValue,unrealized:marketValue-invested,capital,calculated:true};
}
function auditImmutableEntries(older,newer){
 if(!Array.isArray(older)||!Array.isArray(newer))throw Error('Position arrays required');
 const index=new Map(older.map(l=>[lotKey(l),l])),changes=[];
 for(const next of newer){
  const prev=index.get(lotKey(next));if(!prev)continue;
  const fields=['entryPrice','shares','costBasis'];
  const diffs=fields.filter(k=>prev[k]!=null&&next[k]!=null&&Number(prev[k])!==Number(next[k])).map(k=>({field:k,before:prev[k],after:next[k]}));
  if(diffs.length)changes.push({lotId:lotKey(next),changes:diffs,gate:'IMMUTABLE_ENTRY_CHANGED',certifiedInvalidTrade:false});
 }
 return {status:changes.length?'REVIEW_REQUIRED':'PASS',changes,deleted:0};
}
module.exports={auditValuation,auditImmutableEntries,lotKey};
