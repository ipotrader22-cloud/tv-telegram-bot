'use strict';
// Adapter for the EXISTING ib_bridge.py -> POST /bridge/quotes pipeline.
// The established bridge may publish TWS, "TWS delayed", midpoint or close
// quotes for dashboard display. Those are NOT all valid model entry fills.
// This adapter consumes already authenticated, received bridge data. It does
// not open a second TWS socket, expose bridge secrets or submit broker orders.
const {validateQuote,localET}=require('./market-data-adapter.cjs');
const crypto=require('node:crypto');
function fromExistingBridge({payload,date,at,tickers,maxAgeMs=90000}={}){
 const bad=(reason,details=[])=>({status:'BLOCKED',reason,details,quotes:[]});
 if(!payload||!Array.isArray(payload.quotes)||!Array.isArray(tickers)||!at||!date)return bad('BRIDGE_PAYLOAD_INCOMPLETE');
 const expected=new Set(tickers);
 if(expected.size!==tickers.length)return bad('DUPLICATE_REQUESTED_TICKER');
 const quotes=[],errors=[],seen=new Set();
 for(const raw of payload.quotes){
  const ticker=String(raw?.symbol||raw?.ticker||'').toUpperCase();
  if(!expected.has(ticker))continue;
  if(seen.has(ticker)){errors.push('DUPLICATE_BRIDGE_QUOTE:'+ticker);continue}
  seen.add(ticker);
  // Dashboard's "price" can be delayed, a close, or midpoint; never use it
  // as an entry/exit print. Require raw LAST, explicit timestamp AND type.
  const type=Number(raw.market_data_type??raw.marketDataType);
  const source=String(raw.source||raw.quote_source||'');
  const ms=raw.trade_timestamp_ms??raw.last_timestamp_ms;
  const stamp=typeof ms==='number'&&Number.isFinite(ms)?new Date(ms).toISOString():raw.trade_timestamp||raw.last_timestamp;
  if(type!==1||source!=='TWS'||!(Number.isFinite(raw.last)&&raw.last>0)||
     !stamp||!Number.isFinite(Date.parse(stamp))||raw.quote_kind!=='LAST_TRADE'||!raw.trade_id||
     !Number.isFinite(raw.last_size)||raw.last_size<=0){
    errors.push('NOT_ATTESTED_REALTIME_LAST_TRADE:'+ticker);continue;
  }
  const session=localET(stamp);
  const quote={ticker,price:raw.last,timestamp:stamp,sourceId:'EXISTING_BRIDGE:'+raw.trade_id,
    provider:'IBKR_TWS',session:session.date===date&&session.minute>=570&&session.minute<960?'REGULAR':'OTHER',
    verified:true,exchangeVolume:raw.last_size};
  const v=validateQuote({ticker,quote,at,date,maxAgeMs});
  if(v.status!=='PASS')errors.push(v.reason+':'+ticker);
  else quotes.push(quote);
 }
 for(const t of expected)if(!seen.has(t))errors.push('MISSING_BRIDGE_TICKER:'+t);
 return errors.length?bad('BRIDGE_QUOTES_NOT_EXECUTION_GRADE',errors):{status:'PASS',quotes,
   evidenceHash:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
module.exports={fromExistingBridge};
