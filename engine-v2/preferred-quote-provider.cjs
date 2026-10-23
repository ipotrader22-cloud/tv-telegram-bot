'use strict';
// Provider preference contract: verified TWS LAST first, dated Yahoo minute
// reference only when the owner-approved fallback is enabled. No TWS mutations.
const {validateModelReference}=require('./market-data-adapter.cjs');
function createPreferredQuoteProvider({twsProvider,yahooProvider,allowIndicativeFallback=false}={}){
 if(!yahooProvider?.getQuotes)throw Error('YAHOO_REFERENCE_PROVIDER_REQUIRED');
 return {async getQuotes({date,runAt,tickers=[]}={}){
  if(!Array.isArray(tickers)||new Set(tickers).size!==tickers.length)throw Error('INVALID_REQUESTED_TICKERS');
  let tws=[];
  if(twsProvider?.getQuotes){
   try{const r=await twsProvider.getQuotes({date,runAt,tickers});if(Array.isArray(r))tws=r}catch{}
  }
  const map=new Map();
  for(const ticker of tickers){
   const choices=tws.filter(x=>x.ticker===ticker);
   if(choices.length!==1)continue;
   const check=validateModelReference({ticker,quote:choices[0],at:runAt,date});
   if(check.status==='VERIFIED_LIVE_TRADE'&&choices[0].indicative!==true)map.set(ticker,choices[0]);
  }
  const missing=tickers.filter(t=>!map.has(t));
  if(missing.length){
   if(!allowIndicativeFallback)throw Error('VERIFIED_TWS_MARKS_MISSING_AND_FALLBACK_DISABLED');
   const fallback=await yahooProvider.getQuotes({date,runAt,tickers:missing});
   for(const q of fallback){
    if(!missing.includes(q.ticker)||map.has(q.ticker))throw Error('UNREQUESTED_OR_DUPLICATED_FALLBACK_SYMBOL');
    const checked=validateModelReference({ticker:q.ticker,quote:q,at:runAt,date,allowIndicativeFallback:true});
    if(checked.status!=='INDICATIVE_REFERENCE_VALIDATED')throw Error('UNVERIFIED_FALLBACK_MARK');
    map.set(q.ticker,q);
   }
  }
  if(map.size!==tickers.length)throw Error('INCOMPLETE_MARKET_PRICE_COVERAGE');
  return tickers.map(t=>map.get(t));
 }};
}
module.exports={createPreferredQuoteProvider};
