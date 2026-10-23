'use strict';
// Alpaca Basic IEX-only, read-only development adapter. Never submits orders.
// IEX is a single exchange and is NOT a consolidated SIP execution mark.
const {validateQuote}=require('./market-data-adapter.cjs');
function createAlpacaIexAdapter({key=process.env.APCA_API_KEY_ID,secret=process.env.APCA_API_SECRET_KEY,fetchFn=globalThis.fetch}={}){
 if(!key||!secret||typeof fetchFn!=='function')throw Error('ALPACA_IEX_CREDENTIALS_OR_FETCH_MISSING');
 return {async getQuotes({date,runAt,tickers}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(runAt||''))||!Array.isArray(tickers))throw Error('INVALID_REQUEST');
  if(!tickers.length)return [];
  if(tickers.length>30||tickers.some(t=>!/^[A-Z][A-Z.-]{0,9}$/.test(t)))throw Error('INVALID_SYMBOLS');
  const u=new URL('https://data.alpaca.markets/v2/stocks/trades/latest');
  u.searchParams.set('symbols',[...new Set(tickers)].join(','));u.searchParams.set('feed','iex');
  const res=await fetchFn(u.toString(),{headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,'Accept':'application/json'},signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error('ALPACA_IEX_HTTP_'+res.status);
  const body=await res.json();
  return [...new Set(tickers)].map(ticker=>{
   const t=body?.trades?.[ticker];
   if(!t||t.x!=='V'||!Number.isFinite(t.p)||!Number.isFinite(t.s)||t.s<=0||!t.t)throw Error('ALPACA_IEX_MISSING_TRADE_'+ticker);
   const q={ticker,price:t.p,exchangeVolume:t.s,timestamp:t.t,sourceId:'alpaca:iex:'+ticker+':'+String(t.i??t.t),provider:'ALPACA_IEX',session:'REGULAR',verified:true};
   const v=validateQuote({ticker,quote:q,at:runAt,date});
   if(v.status!=='PASS')throw Error('ALPACA_IEX_'+ticker+'_'+v.reason);
   return q;
  });
 }};
}
module.exports={createAlpacaIexAdapter};
