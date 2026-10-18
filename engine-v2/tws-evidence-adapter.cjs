'use strict';
// VIXALE Engine 2.0: strictly read-only IBKR TWS quote evidence adapter.
// Input is a JSON object from the LOCAL read-only TWS bridge, not a broker order.
// Never substitutes delayed/frozen quotes for contemporaneous live trade prints.
const {validateQuote}=require('./market-data-adapter.cjs');
const {createHash}=require('node:crypto');
const isIso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s);
const symbolOk=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(s);
function normalizeTwsTrades({batch,date,at,tickers,maxAgeMs=90000}={}){
 const reject=(reason,details=[])=>({status:'BLOCKED',reason,details,quotes:[]});
 if(!batch||batch.provider!=='IBKR_TWS'||batch.readOnly!==true||batch.marketDataType!==1||batch.connected!==true||!isIso(batch.collectedAt))return reject('TWS_LIVE_READ_ONLY_NOT_ATTESTED');
 if(!Array.isArray(tickers)||new Set(tickers).size!==tickers.length||tickers.some(t=>!symbolOk(t)))return reject('INVALID_REQUESTED_UNIVERSE');
 if(!Array.isArray(batch.trades))return reject('TWS_TRADES_MISSING');
 const seen=new Set(),quotes=[],errors=[];
 for(const t of batch.trades){
  if(!symbolOk(t?.ticker)||seen.has(t.ticker)){errors.push('TWS_DUPLICATE_OR_INVALID_SYMBOL');continue}
  seen.add(t.ticker);
  const quote={ticker:t.ticker,price:t.price,sourceId:t.tradeId,
   provider:'IBKR_TWS',timestamp:t.timestamp,session:t.session,verified:t.marketDataType===1&&t.sourceType==='LAST_TRADE',
   exchangeVolume:t.lastSize};
  const gate=validateQuote({ticker:t.ticker,quote,at,date,maxAgeMs});
  if(gate.status!=='PASS')errors.push(t.ticker+':'+gate.reason);
  else quotes.push(quote);
 }
 for(const ticker of tickers)if(!seen.has(ticker))errors.push('TWS_MISSING_SYMBOL:'+ticker);
 return errors.length?reject('TWS_LIVE_TRADE_NOT_VERIFIED',errors):{status:'PASS',quotes,sourceHash:createHash('sha256').update(JSON.stringify(batch)).digest('hex')};
}
function verifyOpeningBar({bar,ticker,date,entryPrice,heldAtOpen}={}){
 if(!bar||bar.provider!=='IBKR_TWS'||bar.ticker!==ticker||bar.date!==date||bar.session!=='REGULAR'||bar.barMinutes!==1||
 !isIso(bar.start)||!bar.sourceId||bar.marketDataType!==1||!Number.isFinite(bar.volume)||bar.volume<=0||
 !Number.isFinite(bar.open)||bar.open<=0||heldAtOpen!==true)return {status:'BLOCKED',reason:'UNVERIFIED_TWS_REGULAR_OPEN'};
 const {localET}=require('./market-data-adapter.cjs'),et=localET(bar.start);
 if(et.date!==date||et.minute!==570)return {status:'BLOCKED',reason:'NOT_0930_ET_OPEN'};
 if(!Number.isFinite(entryPrice)||entryPrice<=0)return {status:'BLOCKED',reason:'INVALID_ENTRY_REFERENCE'};
 return {status:'PASS',ticker,date,minuteET:'09:30',confirmed:true,session:'REGULAR',
  open:bar.open,time:bar.start,sourceId:bar.sourceId,trigger:bar.open<=entryPrice*.95};
}
function verifyTargetBars({bars,ticker,entryPrice,entryTime,asOf,date}={}){
 const bad=reason=>({status:'BLOCKED',reason});
 if(!Array.isArray(bars)||!bars.length||!isIso(entryTime)||!isIso(asOf)||!Number.isFinite(entryPrice)||entryPrice<=0)return bad('TARGET_BARS_OR_LOT_INCOMPLETE');
 const {localET}=require('./market-data-adapter.cjs');
 let max=null;
 for(const b of bars){
  if(b?.ticker!==ticker||b?.provider!=='IBKR_TWS'||b.marketDataType!==1||b.session!=='REGULAR'||b.barMinutes!==1||!b.sourceId||!isIso(b.start)||
  !Number.isFinite(b.high)||b.high<=0||!Number.isFinite(b.volume)||b.volume<=0)return bad('INVALID_TARGET_BAR');
  const t=Date.parse(b.start),timeET=localET(b.start);
  if(timeET.date!==date||timeET.minute<570||timeET.minute>=960)return bad('NON_REGULAR_TARGET_BAR');
  // A minute bar overlapping entry time cannot establish a post-entry touch.
  if(t<Date.parse(entryTime))continue;
  if(t+60000>Date.parse(asOf))continue; // do not use unfinished bars.
  if(!max||b.high>max.high)max=b;
 }
 if(!max)return bad('NO_COMPLETE_POST_ENTRY_BAR');
 return {status:'PASS',ticker,confirmed:true,session:'REGULAR',high:max.high,time:max.start,sourceId:max.sourceId,targetHit:max.high>=entryPrice*1.1};
}
module.exports={normalizeTwsTrades,verifyOpeningBar,verifyTargetBars};
