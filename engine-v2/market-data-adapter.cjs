'use strict';
// Broker-independent typed market data adapter. The provider is injected;
// this code supplies no fabricated prices and performs no brokerage orders.
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
function localET(timestamp){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
 const obj=Object.fromEntries(p.map(x=>[x.type,x.value]));
 return {date:obj.year+'-'+obj.month+'-'+obj.day,minute:Number(obj.hour)*60+Number(obj.minute)};
}
function validateQuote({ticker,quote,at,date,maxAgeMs=300000}={}){
 const fail=reason=>({status:'BLOCKED',reason,ticker:ticker||null});
 if(!/^[A-Z.-]+$/.test(ticker||'')||!iso(at)||!iso(quote?.timestamp)||!date)return fail('INCOMPLETE_QUOTE_IDENTITY');
 if(quote.ticker!==ticker||!quote.sourceId||!quote.provider||quote.session!=='REGULAR'||quote.verified!==true)return fail('UNVERIFIED_SOURCE_OR_SESSION');
 if(!Number.isFinite(quote.price)||quote.price<=0||!Number.isFinite(quote.exchangeVolume)||quote.exchangeVolume<=0)return fail('INVALID_TRADE_OR_EXCHANGE_VOLUME');
 const qt=Date.parse(quote.timestamp),now=Date.parse(at),age=now-qt;
 if(age<0||age>maxAgeMs)return fail('QUOTE_OUTSIDE_ALLOWED_AGE');
 const t=localET(quote.timestamp);
 if(t.date!==date||t.minute<570||t.minute>=960)return fail('NOT_REGULAR_SESSION_ET');
 if(localET(at).date!==date)return fail('REVIEW_SESSION_MISMATCH');
 return {status:'PASS',ticker,price:quote.price,timestamp:quote.timestamp,sourceId:quote.sourceId,provider:quote.provider,ageMs:age};
}
async function fetchVerifiedQuote({provider,ticker,at,date}){
 if(!provider||typeof provider.getTrade!=='function')throw Error('Verified provider adapter required');
 const quote=await provider.getTrade({ticker,at,date});
 const checked=validateQuote({ticker,quote,at,date});
 return checked.status==='PASS'?{...checked,session:'REGULAR',verified:true}:checked;
}
// Owner-authorized Yahoo/GOOGLEFINANCE indicative marks are distinct from
// verified TWS LAST trades, and can only be used within their declared mode.
function validateModelReference({ticker,quote,at,date,allowIndicativeFallback=false,maxAgeMs=300000}={}){
 if(quote?.indicative===true){
  if(!allowIndicativeFallback)return {status:'BLOCKED',reason:'INDICATIVE_REFERENCE_NOT_AUTHORIZED'};
  if(quote.provider!=='YAHOO_CHART'||quote.priceKind!=='MINUTE_BAR_CLOSE'||quote.modelFill!==false||
     quote.delayed!==true||quote.verified!==true||quote.indicative!==true)return {status:'BLOCKED',reason:'INVALID_FALLBACK_PROVENANCE'};
  const check=validateQuote({ticker,quote,at,date,maxAgeMs});
  return check.status==='PASS'?{...check,status:'INDICATIVE_REFERENCE_VALIDATED',modelFill:false,indicative:true,quoteKind:quote.priceKind}:check;
 }
 const checked=validateQuote({ticker,quote,at,date,maxAgeMs});
 return checked.status==='PASS'?{...checked,status:'VERIFIED_LIVE_TRADE',modelFill:false,indicative:false}:checked;
}
module.exports={validateQuote,validateModelReference,fetchVerifiedQuote,localET};
