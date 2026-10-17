'use strict';
// Historical research connector: evidence only, never execution quotes or model orders.
const {historicalProvider}=require('./historical.cjs');
const {metrics}=require('./research-metrics.cjs');
const symbol=s=>typeof s==='string'&&/^[A-Z.-]+$/.test(s);
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().startsWith(s);
const completed=(bars,reviewDate,label)=>{
 const filtered=bars.filter(b=>b.day<reviewDate);
 if(filtered.length<200)throw Error(label+' lacks 200 completed pre-review bars');
 if(filtered.at(-1).day>=reviewDate)throw Error(label+' incomplete review-day bar');
 return filtered;
};
async function collectEvidence({ticker,marketTicker,sectorTicker,reviewDate,provider=historicalProvider()}){
 if(![ticker,marketTicker,sectorTicker].every(symbol)||new Set([ticker,marketTicker,sectorTicker]).size!==3||!date(reviewDate))throw Error('Explicit distinct tickers and review date required');
 if(!provider||typeof provider.getDailyBars!=='function')throw Error('Historical provider required');
 const items=[];
 // Bounded sequential requests; fail closed on any missing benchmark.
 for(const [label,s] of [['stock',ticker],['market',marketTicker],['sector',sectorTicker]]){
  const response=await provider.getDailyBars(s,{range:'2y',minBars:200});
  if(response.purpose!=='HISTORICAL_RESEARCH_ONLY'||!Array.isArray(response.bars)||!response.bars.every(b=>b.ticker===s))throw Error(label+' unverified historical provider response');
  items.push({symbol:s,bars:completed(response.bars,reviewDate,label),sourceUrl:response.sourceUrl,retrievedAt:response.retrievedAt});
 }
 const dates=items.map(x=>x.bars.at(-1).day);
 if(new Set(dates).size!==1)throw Error('Stock, market and sector evidence ends on different sessions');
 const result=metrics({ticker,bars:items[0].bars,benchmarkBars:items[1].bars,sectorBars:items[2].bars,reviewDate});
 return {ticker,reviewDate,marketTicker,sectorTicker,asOf:result.asOf,facts:result,sources:items.map(x=>({symbol:x.symbol,sourceUrl:x.sourceUrl,retrievedAt:x.retrievedAt,bars:x.bars.length})),status:'FACTS_ONLY_REQUIRES_NINE_FACTOR_REVIEW'};
}
function compareHistoricalDecisions({reviews,recorded}){
 if(!Array.isArray(reviews)||!Array.isArray(recorded))throw Error('Reviews and historical records required');
 const by=new Map(recorded.map(x=>[x.ticker+'|'+x.date,x]));
 return reviews.map(x=>{
  const prior=by.get(x.ticker+'|'+x.reviewDate);
  if(!prior)return {ticker:x.ticker,date:x.reviewDate,status:'NO_HISTORICAL_RECORD'};
  if(!Number.isInteger(x.score)||!Number.isInteger(prior.score))return {ticker:x.ticker,date:x.reviewDate,status:'INSUFFICIENT_SCORE_EVIDENCE'};
  return {ticker:x.ticker,date:x.reviewDate,status:x.score===prior.score?'SCORE_MATCH':'SCORE_DIFFERENCE',independentScore:x.score,recordedScore:prior.score};
 });
}
module.exports={collectEvidence,compareHistoricalDecisions,completed};
