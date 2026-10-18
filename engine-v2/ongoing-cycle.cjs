'use strict';
// Deterministic prospective daily transitions after the first clean-slate day.
// Read-only/pure; close events carry evidence. No Sheet/broker/web publishing.
const {openingStop,targetTouch,score,pnl,snapshot}=require('./core.cjs');
const {validateQuote}=require('./market-data-adapter.cjs');
const {validateResearchBatch}=require('./research-attestation.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
function reviewExisting({date,runAt,session,researchBatch,previous,quotes,openings=[],targets=[]}={}){
 const bad=(reason,details=[])=>({status:'BLOCKED',reason,details,publishable:false});
 if(date<=EPOCH||previous?.epoch!==EPOCH||!Array.isArray(previous?.active)||!Array.isArray(previous?.closed))return bad('INVALID_PREVIOUS_EPOCH');
 const vetted=validateResearchBatch(researchBatch||{});
 if(vetted.status!=='PASS')return bad('FULL_UNIVERSE_NOT_VERIFIED',vetted.errors);
 if(session?.date!==date||session.isTradingDay!==true||session.providerVerified!==true)return bad('INVALID_SESSION');
 const byResearch=new Map(researchBatch.items.map(x=>[x.ticker,x]));
 const byQuotes=new Map((quotes||[]).map(x=>[x.ticker,x]));
 const byOpen=new Map(openings.map(x=>[x.ticker,x]));
 const byTarget=new Map(targets.map(x=>[x.ticker,x]));
 const closed=previous.closed.map(x=>({...x})),active=[],events=[],errors=[];
 const seenClosed=new Set(closed.map(x=>x.ticker+'|'+x.entryDate));
 for(const old of previous.active){
  const id=old.ticker+'|'+old.entryDate;
  if(seenClosed.has(id)){errors.push('PREVIOUS_OVERLAP:'+id);continue}
  const research=byResearch.get(old.ticker),quote=byQuotes.get(old.ticker),checked=validateQuote({ticker:old.ticker,quote,at:runAt,date});
  if(!research||checked.status!=='PASS'){errors.push('MISSING_HOLDING_EVIDENCE:'+id);continue}
  const base={...old,entryPrice:old.entryPrice,heldAtOpen:old.entryDate<date};
  const opening=byOpen.get(old.ticker),high=byTarget.get(old.ticker);
  if(base.heldAtOpen&&(!opening||opening.confirmed!==true||opening.session!=='REGULAR'||opening.minuteET!=='09:30'||opening.date!==date||!opening.sourceId)){errors.push('OPENING_STOP_EVIDENCE_MISSING:'+id);continue}
  const factorScore=score(research.factors);
  let close=null;
  if(base.heldAtOpen){
   try{if(openingStop(base,opening))close={reason:'STOP LOSS',exitPrice:checked.price,time:quote.timestamp,sourceId:quote.sourceId}}catch{errors.push('INVALID_OPENING_EVIDENCE:'+id);continue}
  }
  if(!close&&high){
   try{
    if(high.confirmed!==true||high.session!=='REGULAR'||!high.sourceId||!high.time||Date.parse(high.time)>Date.parse(runAt))throw Error('Unproven intraday target');
    if(!old.entryTime)throw Error('Missing original entry timestamp');
    if(targetTouch({...base,entryTime:old.entryTime},high))
     close={reason:'TARGET',exitPrice:Math.round(old.entryPrice*1.10*1e8)/1e8,time:high.time,sourceId:high.sourceId};
   }catch{errors.push('INVALID_TARGET_EVIDENCE:'+id);continue}
  }
  if(!close&&factorScore<70)close={reason:'DROPPED FROM ACTIVE PORTFOLIO',exitPrice:checked.price,time:quote.timestamp,sourceId:quote.sourceId};
  if(close){
   const ret=close.exitPrice/old.entryPrice-1;
   const record={ticker:old.ticker,entryDate:old.entryDate,exitDate:date,entryPrice:old.entryPrice,exitPrice:close.exitPrice,returnPct:ret,includePublic:'YES',effectiveDate:date,reason:close.reason,exitTime:close.time,lastScore:factorScore};
   closed.push(record);seenClosed.add(id);
   events.push({eventId:[old.ticker,old.entryDate,'CLOSE',date].join('|'),ticker:old.ticker,entryDate:old.entryDate,type:'CLOSE',timestamp:close.time,sourceId:close.sourceId,reason:close.reason,modelPnl:pnl(old.entryPrice,close.exitPrice)});
  }else{
   active.push({...old,currentScore:factorScore,factors:research.factors,currentPrice:checked.price,fullReviewDate:date,lastReviewEvidenceId:research.ohlcvSourceId});
   events.push({eventId:[old.ticker,old.entryDate,'KEEP',date].join('|'),ticker:old.ticker,entryDate:old.entryDate,type:'KEEP',timestamp:quote.timestamp,sourceId:quote.sourceId});
  }
 }
 if(errors.length)return bad('EXISTING_HOLDINGS_UNVERIFIED',errors);
 const held=new Set([...active,...closed].map(x=>x.ticker));
 const eligible=researchBatch.items.filter(x=>x.score>=70&&x.entryEligible===true&&Boolean(x.entryEvidenceId)&&(x.score>=80||Boolean(x.compellingEntryEvidenceId))&&!held.has(x.ticker)).sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker));
 for(const candidate of eligible.slice(0,10-active.length)){
  const quote=byQuotes.get(candidate.ticker),check=validateQuote({ticker:candidate.ticker,quote,at:runAt,date});
  if(check.status!=='PASS')return bad('ENTRY_QUOTE_NOT_VERIFIED',[candidate.ticker+':'+check.reason]);
  active.push({ticker:candidate.ticker,entryDate:date,entryTime:quote.timestamp,entryPrice:check.price,currentPrice:check.price,shares:Math.floor(10000/check.price),entryScore:candidate.score,currentScore:candidate.score,factors:candidate.factors,fullReviewDate:date});
  events.push({eventId:[candidate.ticker,date,'OPEN',date].join('|'),ticker:candidate.ticker,entryDate:date,type:'OPEN',timestamp:quote.timestamp,sourceId:quote.sourceId});
 }
 let model;try{model=snapshot({researchComplete:true,reviewDate:date,active,closed})}catch(e){return bad('SNAPSHOT_INVALID',[e.message])}
 return {status:'VALIDATED_SHADOW_ONLY',date,epoch:EPOCH,active,closed,events,model,publishable:false};
}
module.exports={reviewExisting};
