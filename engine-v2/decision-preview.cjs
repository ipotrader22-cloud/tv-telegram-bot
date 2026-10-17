'use strict';
// Pure shadow decision proposal. NEVER writes Sheets, orders or public site.
const {openingStop,targetClose,stopClose,dropoutClose,key}=require('./core.cjs');
const {validateResearch}=require('./research-gate.cjs');
function propose({date,positions,research,openingEvidence={},targetEvidence={},quotes={},maxNew=2}){
 if(!Array.isArray(positions)||!Array.isArray(research)||positions.length>10||maxNew!==2)throw Error('Invalid proposal context');
 const reviews=new Map();
 for(const r of research){const v=validateResearch(r,{reviewDate:date});if(reviews.has(v.ticker))throw Error('Duplicate research');reviews.set(v.ticker,v)}
 const proposed=[],held=new Set();
 for(const lot of positions){
  const lotId=key(lot);if(held.has(lotId))throw Error('Duplicate active lot');held.add(lotId);
  const opening=openingEvidence[lotId],target=targetEvidence[lotId],quote=quotes[lotId];
  // Do not infer missing 09:30 evidence as a non-trigger; defer when needed.
  if(!opening) {proposed.push({lot:lotId,type:'DEFER',reason:'OPENING_EVIDENCE_MISSING'});continue}
  if(openingStop({...lot,heldAtOpen:true},opening)){
   if(!quote){proposed.push({lot:lotId,type:'DEFER',reason:'CURRENT_QUOTE_MISSING'});continue}
   const c=stopClose({...lot,heldAtOpen:true},opening,quote);proposed.push({...c,type:'CLOSE'});continue;
  }
  if(target){
   const c=targetClose(lot,target);
   if(c){proposed.push({...c,type:'CLOSE'});continue}
  }else{proposed.push({lot:lotId,type:'DEFER',reason:'TARGET_EVIDENCE_MISSING'});continue}
  const r=reviews.get(lot.ticker);
  if(!r){proposed.push({lot:lotId,type:'DEFER',reason:'FULL_RESEARCH_MISSING'});continue}
  if(!r.eligible){
   if(!quote){proposed.push({lot:lotId,type:'DEFER',reason:'CURRENT_QUOTE_MISSING'});continue}
   proposed.push({...dropoutClose(lot,r.score,quote),type:'CLOSE'});continue;
  }
  proposed.push({lot:lotId,type:'KEEP',score:r.score});
 }
 const available=10-positions.length+proposed.filter(x=>x.type==='CLOSE').length;
 const entries=research.filter(x=>reviews.get(x.ticker)?.eligible&&!positions.some(p=>p.ticker===x.ticker)).sort((a,b)=>b.publicScore-a.publicScore||a.ticker.localeCompare(b.ticker)).slice(0,Math.max(0,Math.min(2,available)));
 for(const e of entries){
  const q=quotes[e.ticker];
  if(!q||q.confirmed!==true||q.session!=='REGULAR'||!Number.isFinite(q.price)||q.price<=0||!q.time){proposed.push({ticker:e.ticker,type:'DEFER',reason:'CONTEMPORANEOUS_ENTRY_QUOTE_MISSING'});continue}
  proposed.push({ticker:e.ticker,type:'OPEN_PROPOSAL',entryPrice:q.price,entryTime:q.time,score:e.publicScore,modelAllocation:10000});
 }
 return Object.freeze({mode:'SHADOW_PROPOSAL_ONLY',date,proposed});
}
module.exports={propose};
