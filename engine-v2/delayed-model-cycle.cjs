'use strict';
const {POLICY,hash,priorIdentity,validatePrepared,validFixedQuote,etTime}=require('./delayed-model-policy.cjs');
const {validateResearchBatch}=require('./research-attestation.cjs');
const {validateMorningTrigger}=require('./nyse-morning-clock.cjs');

const {EPOCH}=require('./clean-slate-portfolio.cjs');
const {score,pnl}=require('./core.cjs');
function proposeDelayed({date,runAt,prepared,previous,quotes,pricePolicy=POLICY}){
 const {GOOGLE_POLICY,validGoogleQuote}=require('./google-quote-provider.cjs');
 if(![POLICY,GOOGLE_POLICY].includes(pricePolicy))throw Error('INVALID_REVIEW_PRICE_POLICY');
 const google=pricePolicy===GOOGLE_POLICY;
 validatePrepared(prepared,{date,previous,now:runAt});
 if(!Array.isArray(prepared.exits)||new Set(prepared.exits.map(x=>x.ticker+'|'+x.entryDate)).size!==prepared.exits.length)throw Error('INVALID_EXIT_QUEUE');
 for(const x of prepared.exits){
  if(!(previous?.active||[]).some(p=>p.ticker===x.ticker&&p.entryDate===x.entryDate)||!['STOP LOSS','TARGET','DROPPED FROM ACTIVE PORTFOLIO'].includes(x.reason)||!x.sourceId||!Number.isFinite(Date.parse(x.triggerAt))||Date.parse(x.triggerAt)>Date.parse(prepared.checkedThrough))throw Error('INVALID_EXIT_TRIGGER');
 }
 if(validateMorningTrigger({date,runAt}).status!=='PASS'||validateResearchBatch(prepared.batch).status!=='PASS')throw Error('DELAYED_REVIEW_UNVERIFIED');
 const byResearch=new Map(prepared.batch.items.map(x=>[x.ticker,x])),qm=new Map();
 for(const q of quotes){if(qm.has(q.ticker)||!(google?validGoogleQuote(q,{date,runAt}):validFixedQuote(q,{date,runAt})))throw Error('INVALID_OR_DUPLICATE_FIXED_QUOTE');qm.set(q.ticker,q)}
 const closed=structuredClone(previous?.closed||[]),active=[],events=[],cutoff=google?(quotes.length?quotes.map(q=>q.timestamp).sort()[0]:runAt):etTime(date,580);
 const event=(p,type,q,extra={})=>({eventId:[p.ticker,p.entryDate,type,date].join('|'),ticker:p.ticker,entryDate:p.entryDate,type,timestamp:q.timestamp,decisionAt:runAt,priceAsOf:q.timestamp,pricePolicy,sourceId:q.sourceId,...extra});
 for(const old of previous?.active||[]){
  const r=byResearch.get(old.ticker),q=qm.get(old.ticker),exit=prepared.exits.find(x=>x.ticker===old.ticker&&x.entryDate===old.entryDate);
  if(!r||!q)throw Error('MISSING_HOLDING_EVIDENCE');
  if(exit){
   closed.push({ticker:old.ticker,exchange:old.exchange,entryDate:old.entryDate,entryPrice:old.entryPrice,exitDate:date,exitTime:q.timestamp,exitPrice:q.price,returnPct:q.price/old.entryPrice-1,includePublic:'YES',effectiveDate:date,reason:exit.reason,lastScore:r.score,decisionAt:runAt,pricePolicy,triggerEvidence:exit});
   events.push(event(old,'CLOSE',q,{reason:exit.reason,modelPnl:pnl(old.entryPrice,q.price)}));
  }else{
   if(score(r.factors)<70)throw Error('PREOPEN_EXIT_QUEUE_INCOMPLETE');
   active.push({...old,currentPrice:q.price,currentScore:r.score,factors:r.factors,fullReviewDate:date,publicNote:r.publicNote,quoteSourceId:q.sourceId,priceAsOf:q.timestamp,decisionAt:runAt,pricePolicy,lastTargetCheckedAt:prepared.checkedThrough});
   events.push(event(old,'KEEP',q));
  }
 }
 const excluded=new Set([...active,...closed].map(p=>p.ticker));
 let realized=closed.reduce((n,p)=>n+(p.includePublic==='NO'?0:pnl(p.entryPrice,p.exitPrice)),0);
 let cash=100000+realized-active.length*10000;
 const eligible=prepared.batch.items.filter(x=>x.score>=70&&x.entryEligible===true&&x.entryEvidenceId&&(x.score>=80||x.compellingEntryEvidenceId)&&!excluded.has(x.ticker)).sort((a,b)=>b.score-a.score||a.ticker.localeCompare(b.ticker));
 for(const r of eligible){
  if(active.length>=10||cash<10000)break;
  const q=qm.get(r.ticker);if(!q)throw Error('ENTRY_0940_QUOTE_MISSING');
  const lot={ticker:r.ticker,exchange:r.exchange,entryDate:date,entryTime:q.timestamp,entryPrice:q.price,currentPrice:q.price,shares:Math.floor(10000/q.price),entryScore:r.score,currentScore:r.score,factors:r.factors,fullReviewDate:date,publicNote:r.publicNote,quoteSourceId:q.sourceId,lastTargetCheckedAt:q.timestamp,modelEntryPriceKind:q.priceKind,modelEntryIndicative:true,pricePolicy,decisionAt:runAt,priceAsOf:q.timestamp};
  active.push(lot);events.push(event(lot,'OPEN',q,{price:q.price}));cash-=10000;
 }
 return {date,runAt,session:prepared.batch.session,positions:active,closed,researchBatch:prepared.batch,research:active.map(a=>({ticker:a.ticker,reviewDate:date,timestamp:byResearch.get(a.ticker).timestamp,complete:true,factors:a.factors})),quotes:active.map(a=>qm.get(a.ticker)),events,pricePolicy,sourceEvidence:{quotes,prepared,previous:priorIdentity(previous)},preparedHash:prepared.fingerprint,priceAsOf:cutoff};
}
async function runDelayedCycle({url,date,runAt,clock,prepared,quoteProvider,pricePolicy=POLICY,getPrior=require('./clean-ledger.cjs').readLastCleanState,commit=require('./clean-ledger.cjs').commitShadowRun}){
 try{
  const previous=await getPrior({url});
  if(previous&&previous.date>=date)throw Error('ALREADY_REVIEWED_OR_OUT_OF_ORDER');
  const tickers=[...new Set([...(previous?.active||[]).map(p=>p.ticker),...prepared.batch.items.filter(p=>p.entryEligible).map(p=>p.ticker)])];
  const quotes=await quoteProvider.getQuotes({date,runAt,tickers});
  const completedAt=clock().toISOString();
  const inputs=proposeDelayed({date,runAt:completedAt,prepared,previous,quotes,pricePolicy});
  return await commit({url,inputs});
 }catch(e){return {status:'BLOCKED',reason:e.message,published:false}}
}
module.exports={proposeDelayed,runDelayedCycle};
