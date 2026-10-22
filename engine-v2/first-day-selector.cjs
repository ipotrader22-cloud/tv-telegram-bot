'use strict';
// Read-only selection for FIRST clean-slate portfolio day; subsequent reviews
// require an event-driven exit/rebalance engine and cannot replay this initializer.
const {validateResearchBatch}=require('./research-attestation.cjs');
const {validateModelReference}=require('./market-data-adapter.cjs');
const {planMorningRun}=require('./morning-run-plan.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {score}=require('./core.cjs');
function firstDayPortfolio({date,runAt,session,researchBatch,quotes,priorActive=[],priorClosed=[],allowIndicativeFallback=false}={}){
 const blocked=(reason,details=[])=>({status:'BLOCKED',reason,details,publishable:false});
 if(typeof date!=='string'||date<EPOCH)return blocked('BEFORE_CLEAN_EPOCH');
 if(priorActive.length||priorClosed.length)return blocked('LEGACY_POSITIONS_NOT_ALLOWED');
 const evidence=validateResearchBatch(researchBatch||{});
 if(evidence.status!=='PASS')return blocked('UNVERIFIED_FULL_UNIVERSE',evidence.errors);
 if(session?.date!==date||session?.isTradingDay!==true||session?.providerVerified!==true)return blocked('SESSION_NOT_CERTIFIED');
 const eligible=researchBatch.items.filter(x=>x.score>=70&&x.entryEligible===true&&Boolean(x.entryEvidenceId)&&(x.score>=80||Boolean(x.compellingEntryEvidenceId))).sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).slice(0,10);
 const byTicker=new Map((quotes||[]).map(q=>[q.ticker,q]));
 const positions=[],failures=[];
 for(const candidate of eligible){
  const q=byTicker.get(candidate.ticker),checked=validateModelReference({ticker:candidate.ticker,quote:q,at:runAt,date,allowIndicativeFallback});
  if(!['VERIFIED_LIVE_TRADE','INDICATIVE_REFERENCE_VALIDATED'].includes(checked.status)){failures.push(candidate.ticker+':'+checked.reason);continue}
  const price=checked.price;
  positions.push({ticker:candidate.ticker,exchange:candidate.exchange,publicNote:candidate.publicNote,entryDate:date,entryTime:q.timestamp,lastTargetCheckedAt:q.timestamp,entryPrice:price,entryScore:candidate.score,currentPrice:price,currentScore:candidate.score,factors:candidate.factors,fullReviewDate:date,
   shares:Math.floor(10000/price),reviewEvidenceId:candidate.ohlcvSourceId,quoteSourceId:checked.sourceId,modelEntryPriceKind:checked.quoteKind||'LAST_TRADE',modelEntryIndicative:checked.indicative===true});
 }
 if(failures.length)return blocked('ELIGIBLE_POSITION_QUOTE_FAILURE',failures);
 const research=positions.map(p=>({ticker:p.ticker,reviewDate:date,timestamp:researchBatch.items.find(x=>x.ticker===p.ticker).timestamp,complete:true,factors:p.factors}));
 const quoteProof=positions.map(p=>({ticker:p.ticker,sourceId:p.quoteSourceId,timestamp:p.entryTime,price:p.entryPrice}));
 const run=planMorningRun({date,runAt,session,positions,closed:[],research,quotes:quoteProof});
 if(run.status!=='VALIDATED_SHADOW_ONLY')return blocked('MODEL_PLAN_FAILED',[run.reason||run.status]);
 const events=positions.map(p=>({eventId:[p.ticker,date,'OPEN',date].join('|'),ticker:p.ticker,entryDate:date,type:'OPEN',timestamp:p.entryTime,sourceId:p.quoteSourceId,price:p.entryPrice,score:p.currentScore}));
 return {status:'VALIDATED_SHADOW_ONLY',date,positions,closed:[],events,model:run.model,runId:run.runId,checksum:run.checksum,publishable:false};
}
module.exports={firstDayPortfolio};
