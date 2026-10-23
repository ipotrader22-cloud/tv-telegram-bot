'use strict';
const {fromExistingBridge}=require('./existing-tws-bridge-adapter.cjs');
function bridgeQuoteProvider({loadAuthenticatedPayload}={}){
 if(typeof loadAuthenticatedPayload!=='function')throw Error('Authenticated quote source required');
 return {async getQuotes({date,runAt,tickers}={}){
  if(!date||!runAt||!Array.isArray(tickers))throw Error('Dated quote request required');
  if(!tickers.length)return [];
  const data=await loadAuthenticatedPayload({date,runAt,tickers});
  if(data?.authenticated!==true)throw Error('Authenticated Render evidence missing');
  const receipt=Date.parse(data.receivedAt||'');
  if(!Number.isFinite(receipt)||receipt>Date.parse(runAt)||Date.parse(runAt)-receipt>90000)throw Error('Render quote receipt missing or stale');
  const checked=fromExistingBridge({payload:data.payload,date,at:runAt,tickers});
  if(checked.status!=='PASS')throw Error('Quote evidence blocked: '+checked.reason);
  return checked.quotes;
 }};
}
module.exports={bridgeQuoteProvider};
