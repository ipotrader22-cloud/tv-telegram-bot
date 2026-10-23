'use strict';
// Live read-only Yahoo fallback health probe against SPY benchmark.
// Probes are observability, never independent research or trade approval.
const {createYahooMinuteProvider,quoteFromBars}=require('./yahoo-minute-fallback.cjs');
const {localET}=require('./market-data-adapter.cjs');
async function checkMinuteFeed({at=new Date().toISOString(),provider=createYahooMinuteProvider(),ticker='SPY'}={}){
 const date=localET(at).date;
 try{
  const response=await provider.getBars({ticker,date,at});
  if(!Array.isArray(response?.bars))return {status:'BLOCKED',reason:'OHLCV_PROVIDER_INVALID',tradeEvidenceVerified:false,modelEntryEligible:false};
  const quote=quoteFromBars(response.bars,{ticker,date,at});
  if(quote.status!=='REFERENCE_MARK')return {status:'BLOCKED',reason:quote.reason,tradeEvidenceVerified:false,modelEntryEligible:false};
  return {status:'INDICATIVE_MINUTE_FEED_OBSERVED',ticker,date,sourceId:quote.sourceId,
   referenceMinute:quote.timestamp,ageMs:quote.ageMs,
   indicative:true,tradeEvidenceVerified:false,modelEntryEligible:false};
 }catch(e){
  return {status:'BLOCKED',reason:'OHLCV_PROVIDER_UNAVAILABLE',tradeEvidenceVerified:false,modelEntryEligible:false};
 }
}
module.exports={checkMinuteFeed};
