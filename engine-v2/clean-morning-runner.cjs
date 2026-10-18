'use strict';
// First-session shadow coordinator. Shadow DB only; no live Sheet/website changes.
// Source interfaces are injectable and must return dated, independently attested inputs.
const {firstDayPortfolio}=require('./first-day-selector.cjs');
const {commitShadowRun}=require('./clean-ledger.cjs');
const {EPOCH}=require('./clean-slate-portfolio.cjs');
async function runFirstSession({date=EPOCH,runAt,sessionProvider,researchProvider,quoteProvider,url,commit=commitShadowRun}={}){
 const fail=(reason,details=[])=>({status:'BLOCKED',reason,details,published:false});
 if(date!==EPOCH)return fail('NOT_FIRST_SESSION');
 if(!sessionProvider||!researchProvider||!quoteProvider)return fail('MISSING_VERIFIED_PROVIDER');
 if(typeof sessionProvider.getSession!=='function'||typeof researchProvider.getBatch!=='function'||typeof quoteProvider.getQuotes!=='function')return fail('INVALID_PROVIDER_CONTRACT');
 // Fetch under an explicit timestamp; no data is synthesized on outages.
 let session,researchBatch,quotes;
 try{
  session=await sessionProvider.getSession({date,runAt});
  if(session?.date!==date||session?.isTradingDay!==true||session?.providerVerified!==true)return fail('TRADING_SESSION_UNVERIFIED');
  researchBatch=await researchProvider.getBatch({date,runAt,session});
  if(!researchBatch||researchBatch.date!==date)return fail('RESEARCH_DATE_MISMATCH');
  const eligible=(researchBatch.items||[]).filter(x=>x.score>=70).sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker)).slice(0,10).map(x=>x.ticker);
  quotes=await quoteProvider.getQuotes({date,runAt,tickers:eligible});
 }catch(e){return fail('UPSTREAM_DATA_UNAVAILABLE',[e.message])}
 const plan=firstDayPortfolio({date,runAt,session,researchBatch,quotes});
 if(plan.status!=='VALIDATED_SHADOW_ONLY')return fail(plan.reason||plan.status,plan.details||[]);
 const research=plan.positions.map(p=>({ticker:p.ticker,reviewDate:date,timestamp:researchBatch.items.find(x=>x.ticker===p.ticker).timestamp,complete:true,factors:p.factors}));
 const quoteEvidence=plan.positions.map(p=>({ticker:p.ticker,timestamp:p.entryTime,sourceId:p.quoteSourceId,price:p.entryPrice}));
 const inputs={date,runAt,session,researchBatch,positions:plan.positions,closed:[],research,quotes:quoteEvidence,events:plan.events};
 try{
  const result=await commit({url,inputs});
  return {...result,published:false,epoch:EPOCH};
 }catch(e){return fail('SHADOW_LEDGER_ERROR',[e.message])}
}
module.exports={runFirstSession};
