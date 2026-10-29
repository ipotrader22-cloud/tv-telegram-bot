'use strict';
// Live read-only Yahoo fallback health probe against SPY benchmark.
// Probes are observability, never independent research or trade approval.
const {createYahooMinuteProvider,quoteFromBars}=require('./yahoo-minute-fallback.cjs');
const {localET}=require('./market-data-adapter.cjs');
function sourceFailure(e){
 const codes={
  YAHOO_MINUTE_DATA_HTTP_429:'RATE_LIMITED',
  YAHOO_MINUTE_DATA_HTTP_401:'ACCESS_DENIED',YAHOO_MINUTE_DATA_HTTP_403:'ACCESS_DENIED',
  YAHOO_MINUTE_DATA_HTTP_404:'SOURCE_NOT_FOUND',
  YAHOO_MINUTE_DATA_HTTP_500:'SOURCE_SERVER_ERROR',YAHOO_MINUTE_DATA_HTTP_502:'SOURCE_SERVER_ERROR',
  YAHOO_MINUTE_DATA_HTTP_503:'SOURCE_SERVER_ERROR',YAHOO_MINUTE_DATA_HTTP_504:'SOURCE_SERVER_ERROR',
  INVALID_YAHOO_CHART:'INVALID_CHART',
  YAHOO_MINUTE_TIMESTAMP_SEQUENCE_INVALID:'INVALID_MINUTE_SEQUENCE',
  YAHOO_MINUTE_OHLCV_LENGTH_MISMATCH:'INVALID_OHLCV_LENGTH'
 };
 if(Object.hasOwn(codes,e?.message))return codes[e.message];
 if(e?.name==='TimeoutError'||e?.name==='AbortError')return 'REQUEST_TIMEOUT';
 if(e?.name==='SyntaxError')return 'INVALID_JSON';
 return 'UNCLASSIFIED_PROVIDER_FAILURE';
}
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
  return {status:'BLOCKED',reason:'OHLCV_PROVIDER_UNAVAILABLE',sourceFailure:sourceFailure(e),tradeEvidenceVerified:false,modelEntryEligible:false};
 }
}
module.exports={checkMinuteFeed};
