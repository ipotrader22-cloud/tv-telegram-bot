'use strict';
// Engine 2 clean-slate consecutive-session coordinator. Isolated Postgres only.
// Providers are external verified sources; missing one blocks, no invented inputs.
const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {firstDayPortfolio}=require('./first-day-selector.cjs');
const {reviewExisting}=require('./ongoing-cycle.cjs');
const {commitShadowRun,readLastCleanState}=require('./clean-ledger.cjs');
async function runCleanCycle({
 date,runAt,url,researchProvider,quoteProvider,openProvider,targetProvider,
 getPrior=readLastCleanState,commit=commitShadowRun
}={}){
 const fail=(reason,detail)=>({status:'BLOCKED',reason,detail,published:false});
 if(!date||date<EPOCH||!Number.isFinite(Date.parse(runAt||'')))return fail('INVALID_DATE_OR_TIMESTAMP');
 if(!researchProvider?.getBatch||!quoteProvider?.getQuotes)return fail('INPUT_PROVIDER_NOT_CONFIGURED');
 let session;try{session=sessionEvidence(date)}catch(e){return fail('NYSE_CALENDAR_INVALID',e.message)}
 if(!session.isTradingDay)return {status:'SKIPPED_CLOSED_MARKET',date,published:false};
 let previous;
 try{previous=await getPrior({url})}catch(e){return fail('PRIOR_LEDGER_UNAVAILABLE',e.message)}
 if(date===EPOCH&&previous)return fail('EPOCH_ALREADY_INITIALIZED');
 if(date!==EPOCH&&(!previous||previous.date>=date))return fail('NO_VALID_PRIOR_SESSION');
 let researchBatch,quotes,openings=[],targets=[];
 try{
  researchBatch=await researchProvider.getBatch({date,runAt,session,previous});
  if(!Array.isArray(researchBatch?.items)||researchBatch.date!==date)return fail('RESEARCH_BATCH_MISSING');
  // Existing holdings need a fresh quote even if today's ranking drops below 70.
  const requested=[...new Set([...(previous?.active||[]).map(x=>x.ticker),...researchBatch.items.filter(x=>x.score>=70&&x.entryEligible===true).map(x=>x.ticker)])];
  quotes=await quoteProvider.getQuotes({date,runAt,tickers:requested});
  if(!Array.isArray(quotes))return fail('QUOTE_PROVIDER_MISSING');
  if(previous?.active.length){
   if(!openProvider?.getOpenings||!targetProvider?.getTargets)return fail('OPENING_TARGET_PROVIDERS_NOT_CONFIGURED');
   openings=await openProvider.getOpenings({date,runAt,positions:previous.active});
   targets=await targetProvider.getTargets({date,runAt,positions:previous.active});
   if(!Array.isArray(openings)||!Array.isArray(targets))return fail('OPENING_OR_TARGET_EVIDENCE_MISSING');
  }
 }catch(e){return fail('SOURCE_READ_FAILED',e.message)}
 const proposal= date===EPOCH
  ?firstDayPortfolio({date,runAt,session,researchBatch,quotes})
  :reviewExisting({date,runAt,session,researchBatch,previous,quotes,openings,targets});
 if(proposal.status!=='VALIDATED_SHADOW_ONLY')return fail('MODEL_EVIDENCE_BLOCKED',proposal);
 const active=proposal.positions||proposal.active,closed=proposal.closed||[];
 const research=active.map(a=>({ticker:a.ticker,reviewDate:date,
  timestamp:researchBatch.items.find(x=>x.ticker===a.ticker)?.timestamp,complete:true,factors:a.factors}));
 const freshQuotes=active.map(a=>{const q=quotes.find(x=>x.ticker===a.ticker);return {ticker:a.ticker,price:a.currentPrice,sourceId:q?.sourceId,timestamp:q?.timestamp}});
 const inputs={date,runAt,session,positions:active,closed,researchBatch,research,quotes:freshQuotes,events:proposal.events};
 try{return {...await commit({url,inputs}),published:false}}catch(e){return fail('SHADOW_DB_COMMIT_FAILED',e.message)}
}
module.exports={runCleanCycle};
