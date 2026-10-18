'use strict';
// Safe, deterministic clean-slate daily run planner. No side effects or live publishing.
const {createHash}=require('node:crypto');
const {EPOCH,buildDailySnapshot}=require('./clean-slate-portfolio.cjs');
const {score,key}=require('./core.cjs');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
function planMorningRun({date,runAt,session,positions=[],closed=[],research=[],quotes=[],lastApproved=null,previousRun=null}={}){
 const blocked=(reason,details=[])=>({status:'BLOCKED',reason,details,epoch:EPOCH,date:date||null,publishable:false,previousApproved: lastApproved?.runId||null});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date<EPOCH)return blocked('INVALID_SESSION_DATE');
 if(session?.date!==date||session?.isTradingDay!==true||session?.providerVerified!==true)return blocked('NYSE_SESSION_NOT_VERIFIED');
 if(!iso(runAt)||new Date(runAt).toLocaleDateString('en-CA',{timeZone:'America/New_York'})!==date)return blocked('RUN_TIMESTAMP_DATE_MISMATCH');
 const runId='engine2|'+EPOCH+'|'+date+'|morning';
 if(previousRun?.runId===runId)return {status:'ALREADY_PLANNED',runId,publishable:false,previousApproved:lastApproved?.runId||null};
 const failures=[],rmap=new Map(research.map(x=>[x.ticker,x])),qmap=new Map(quotes.map(x=>[x.ticker,x]));
 for(const lot of positions){
  let k;try{k=key(lot)}catch{failures.push('INVALID_LOT');continue}
  if(lot.entryDate<EPOCH)failures.push('LEGACY_LOT:'+k);
  const proof=rmap.get(lot.ticker),quote=qmap.get(lot.ticker);
  if(!proof||proof.complete!==true||proof.reviewDate!==date||!iso(proof.timestamp)||Date.parse(proof.timestamp)>Date.parse(runAt)||score(proof.factors)!==lot.currentScore)failures.push('RESEARCH_NOT_PROVEN:'+k);
  if(!quote||quote.sourceId==null||!iso(quote.timestamp)||Date.parse(quote.timestamp)>Date.parse(runAt)||Date.parse(runAt)-Date.parse(quote.timestamp)>300000||!Number.isFinite(quote.price)||quote.price<=0||quote.price!==lot.currentPrice)failures.push('QUOTE_NOT_FRESH:'+k);
 }
 if(failures.length)return blocked('INCOMPLETE_DAILY_EVIDENCE',failures);
 let snapshot;try{
  snapshot=buildDailySnapshot({date,positions,closed,researchComplete:true,quoteEvidenceComplete:true,marketSessionConfirmed:true});
 }catch(e){return blocked('MODEL_VALIDATION_FAILED',[e.message])}
 if(snapshot.status!=='VALIDATED_NOT_PUBLISHED')return blocked(snapshot.reason||'SNAPSHOT_NOT_VALIDATED');
 const checksum=createHash('sha256').update(JSON.stringify({runId,positions,closed,snapshot})).digest('hex');
 return {status:'VALIDATED_SHADOW_ONLY',runId,checksum,epoch:EPOCH,date,model:snapshot,publishable:false,requiresCutoverApproval:true};
}
module.exports={planMorningRun};
