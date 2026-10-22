'use strict';
// Fallback adapter using Yahoo minute OHLCV. No broker access, no cloud secrets.
// Indicative 1-minute model reference marks, NEVER exchange LAST executions.
// Fail closed for missing/delayed bars; never overwrite TWS real LAST evidence.
const {createHash}=require('node:crypto');
const {localET}=require('./market-data-adapter.cjs');
const supportedSymbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(s);
function completedBars(raw,{ticker,date,asOf}={}){
 if(!supportedSymbol(ticker)||!Number.isFinite(Date.parse(asOf||'')))throw Error('INVALID_INSTRUMENT_OR_CLOCK');
 const chart=raw?.chart?.result?.[0];
 if(!chart||chart.meta?.symbol!==ticker||!Array.isArray(chart.timestamp)||!chart.indicators?.quote?.[0])throw Error('INVALID_YAHOO_CHART');
 const q=chart.indicators.quote[0],ms=Date.parse(asOf);
 const bars=[];
 for(let i=0;i<chart.timestamp.length;i++){
  const start=chart.timestamp[i]*1000;
  const values=[q.open?.[i],q.high?.[i],q.low?.[i],q.close?.[i],q.volume?.[i]];
  if(start+60000>ms)continue; // only completed bars, never partial.
  const et=localET(new Date(start).toISOString());
  if(et.date!==date||et.minute<570||et.minute>=960)continue;
  if(values.some(x=>typeof x!=='number'||!Number.isFinite(x))||values.slice(0,4).some(x=>x<=0)||values[4]<=0)continue;
  const [open,high,low,close,volume]=values;
  if(high<Math.max(open,close,low)||low>Math.min(open,close,high))continue;
  bars.push({ticker,date,start:new Date(start).toISOString(),end:new Date(start+60000).toISOString(),
    open,high,low,close,volume,sourceId:'YAHOO_1M:'+ticker+':'+start,barMinutes:1,session:'REGULAR',
    provider:'YAHOO_CHART',priceKind:'MINUTE_BAR_OHLCV',dataDelayed:true});
 }
 return bars.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
function quoteFromBars(bars,{ticker,date,at,maxAgeMs=300000}={}){
 const blocked=reason=>({status:'BLOCKED',reason,ticker});
 if(!Array.isArray(bars)||!bars.length||!Number.isFinite(Date.parse(at||'')))return blocked('NO_COMPLETED_MINUTE_BAR');
 const b=bars.at(-1);
 if(b.ticker!==ticker||b.date!==date||!b.sourceId)return blocked('SOURCE_MISMATCH');
 const age=Date.parse(at)-Date.parse(b.end);
 if(age<0||age>maxAgeMs)return blocked('FALLBACK_REFERENCE_MARK_STALE');
 return {status:'REFERENCE_MARK',ticker,price:b.close,timestamp:b.end,sourceId:b.sourceId,
   provider:b.provider,session:'REGULAR',verified:true,exchangeVolume:b.volume,
   priceKind:'MINUTE_BAR_CLOSE',indicative:true,delayed:true,modelFill:false,ageMs:age};
}
function openingFromBars(bars,{ticker,date}={}){
 const b=bars.find(x=>x.ticker===ticker&&x.date===date&&localET(x.start).minute===570);
 return b?{ticker,date,open:b.open,time:b.start,minuteET:'09:30',sourceId:b.sourceId,
   confirmed:true,session:'REGULAR',priceKind:'MINUTE_BAR_OPEN',indicative:true}:
  {status:'BLOCKED',reason:'FALLBACK_0930_OPEN_UNAVAILABLE'};
}
function targetFromBars(bars,{ticker,date,entryTime,at}={}){
 if(!entryTime||!at||!Number.isFinite(Date.parse(entryTime)))return {status:'BLOCKED',reason:'ENTRY_TIMESTAMP_REQUIRED'};
 const completed=bars.filter(b=>b.ticker===ticker&&b.date===date&&Date.parse(b.start)>=Date.parse(entryTime)&&Date.parse(b.end)<=Date.parse(at));
 if(!completed.length)return {status:'BLOCKED',reason:'NO_POST_ENTRY_COMPLETED_BAR'};
 const high=completed.reduce((a,b)=>b.high>a.high?b:a);
 return {ticker,confirmed:true,session:'REGULAR',high:high.high,time:high.end,sourceId:high.sourceId,priceKind:'MINUTE_BAR_HIGH',indicative:true};
}
function createYahooMinuteProvider({fetchFn=fetch}={}){
 async function getBars({ticker,date,at}){
  if(!supportedSymbol(ticker))throw Error('INVALID_SYMBOL');
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?interval=1m&range=1d';
  const response=await fetchFn(url,{headers:{Accept:'application/json','Cache-Control':'no-cache','User-Agent':'VixaleResearch/2.0'},
    signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('YAHOO_MINUTE_DATA_HTTP_'+response.status);
  const raw=await response.json();
  const bars=completedBars(raw,{ticker,date,asOf:at});
  return {ticker,bars,sourceHash:createHash('sha256').update(JSON.stringify(raw)).digest('hex')};
 }
 return {getBars,
  async getQuotes({date,runAt,tickers}){
   const values=await Promise.all(tickers.map(ticker=>getBars({ticker,date,at:runAt}).then(x=>quoteFromBars(x.bars,{ticker,date,at:runAt}))));
   const failure=values.find(x=>x.status!=='REFERENCE_MARK');
   if(failure)throw Error(failure.reason);
   return values;
  },
  async getOpenings({date,runAt,positions}){
   return Promise.all(positions.map(async p=>openingFromBars((await getBars({ticker:p.ticker,date,at:runAt})).bars,{ticker:p.ticker,date})));
  },
  async getTargets({date,runAt,positions}){
   return Promise.all(positions.map(async p=>targetFromBars((await getBars({ticker:p.ticker,date,at:runAt})).bars,
     {ticker:p.ticker,date,entryTime:p.entryTime,at:runAt})));
  }};
}
module.exports={completedBars,quoteFromBars,openingFromBars,targetFromBars,createYahooMinuteProvider};
