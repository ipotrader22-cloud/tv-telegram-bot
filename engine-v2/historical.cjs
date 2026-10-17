'use strict';
// Historical Yahoo chart v8 adapter: independently verify symbol, zone, dates, and OHLCV.
// Data is research evidence only: never an automatic live execution quote.
const ok=(x,m)=>{if(!x)throw Error(m)};
function barsFromChart(payload,{ticker,interval='1d',minBars=1}={}){
 ok(/^[A-Z.-]+$/.test(ticker),'Invalid ticker');
 const result=payload?.chart?.result;
 ok(Array.isArray(result)&&result.length===1&&!payload.chart.error,'Invalid chart response');
 const item=result[0],meta=item.meta||{},q=item.indicators?.quote?.[0];
 ok(String(meta.symbol).toUpperCase()===ticker,'Chart symbol mismatch');
 ok(meta.exchangeTimezoneName==='America/New_York','Unexpected exchange timezone');
 ok(Array.isArray(item.timestamp)&&q,'Missing time series');
 const output=[];
 for(let i=0;i<item.timestamp.length;i++){
  const time=item.timestamp[i]*1000,open=q.open?.[i],high=q.high?.[i],low=q.low?.[i],close=q.close?.[i],volume=q.volume?.[i];
  if(![open,high,low,close,volume,time].every(Number.isFinite))continue;
  if(open<=0||high<Math.max(open,close)||low>Math.min(open,close)||low<=0||volume<=0)continue;
  const asOf=new Date(time).toISOString();
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  output.push({ticker,interval,asOf,day,open,high,low,close,volume,source:'yahoo-chart-v8'});
 }
 ok(output.length>=minBars,'Insufficient valid dated bars');
 for(let i=1;i<output.length;i++)ok(output[i].asOf>output[i-1].asOf,'Unsorted/duplicate bars');
 return output;
}
function historicalProvider({fetchImpl=globalThis.fetch,base='https://query1.finance.yahoo.com/v8/finance/chart'}={}){
 ok(typeof fetchImpl==='function','HTTP client required');
 return {async getDailyBars(ticker,{range='1y',minBars=200}={}){
  ok(/^[A-Z.-]+$/.test(ticker),'Invalid ticker');
  const url=new URL(base+'/'+encodeURIComponent(ticker));url.searchParams.set('interval','1d');url.searchParams.set('range',range);
  const response=await fetchImpl(url.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  ok(response.ok,'Historical market data HTTP '+response.status);
  const bars=barsFromChart(await response.json(),{ticker,minBars});
  return {bars,sourceUrl:url.toString(),retrievedAt:new Date().toISOString(),purpose:'HISTORICAL_RESEARCH_ONLY'};
 }};
}
module.exports={barsFromChart,historicalProvider};
