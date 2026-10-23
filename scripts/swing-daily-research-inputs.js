"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const { session, previousSession } = require("./swing-market-calendar");
const nyDay = t => new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(t*1000));
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const round = x => Math.round(x*1000)/1000;
function analyze(chart, date) {
  if (!chart || nyDay(chart.meta.regularMarketTime) !== date) throw new Error("Quote is not from today's session");
  if (!Number.isFinite(chart.meta.regularMarketPrice) || chart.meta.regularMarketPrice<=0) throw new Error("Invalid current quote");
  const q = chart.indicators?.quote?.[0];
  if (!q) throw new Error("Missing daily OHLCV");
  const bars = chart.timestamp.map((t,i)=>({ date:nyDay(t), open:q.open[i], high:q.high[i], low:q.low[i], close:q.close[i], volume:q.volume[i] }))
    .filter(x=>Object.values(x).every(v=>v!==null&&v!==undefined));
  const complete = bars.filter(x=>x.date<date);
  if (complete.length<200 || complete.at(-1).date!==previousSession(date)) throw new Error("Missing completed-session history");
  if (complete.some(x=>![x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite) || x.close<=0 || x.volume<0)) throw new Error("Invalid OHLCV");
  const last=complete.at(-1), back=n=>complete.slice(-n);
  const range=n=>{ const a=back(n); return (Math.max(...a.map(x=>x.high))-Math.min(...a.map(x=>x.low)))/last.close*100; };
  let up=0,down=0;
  for(let i=complete.length-20;i<complete.length;i++) { if(complete[i].close>complete[i-1].close) up+=complete[i].volume; else if(complete[i].close<complete[i-1].close) down+=complete[i].volume; }
  const metrics = { symbol:chart.meta.symbol, quoteDate:date, quoteTime:new Date(chart.meta.regularMarketTime*1000).toISOString(), price:chart.meta.regularMarketPrice,
    lastCompleteDate:last.date, lastCompleteClose:round(last.close), dailyBars:complete.length,
    sma20:round(mean(back(20).map(x=>x.close))), sma50:round(mean(back(50).map(x=>x.close))), sma200:round(mean(back(200).map(x=>x.close))),
    return20Pct:round((last.close/complete.at(-21).close-1)*100), return60Pct:round((last.close/complete.at(-61).close-1)*100),
    lastCompleteRelativeVolume:round(last.volume/mean(complete.slice(-21,-1).map(x=>x.volume))), upDownVolume20:down?round(up/down):null,
    range5Pct:round(range(5)), range20Pct:round(range(20)), high20:round(Math.max(...back(20).map(x=>x.high))), high60:round(Math.max(...back(60).map(x=>x.high))),
    todayChangePct:round((chart.meta.regularMarketPrice/last.close-1)*100) };
  return { metrics, bars };
}
async function json(url) {
  for(let attempt=1;attempt<=3;attempt++) {
    try { const r=await fetch(url,{headers:{"User-Agent":"VixaleResearch/1.0","Cache-Control":"no-cache"},signal:AbortSignal.timeout(20000)});
      if(!r.ok) { const e=new Error("HTTP "+r.status); e.retryable=r.status===429||r.status>=500; throw e; } return await r.json();
    } catch(e) { const transient=e.retryable===true || ["TimeoutError","AbortError"].includes(e.name) || ["ETIMEDOUT","ECONNRESET","ENOTFOUND","EAI_AGAIN"].includes(e.cause?.code);
      if(attempt===3||!transient) throw e; await new Promise(r=>setTimeout(r,attempt*1500)); }
  }
}
async function main() {
  const date=nyDay(Date.now()/1000), trading=session(date);
  if(!trading.open) { console.log(JSON.stringify({gate:"RESEARCH_INPUTS",result:"SKIP",date})); return; }
  let feed=null, symbols, candidates=null;
  if(process.env.VIXALE_V2_RESEARCH_UNIVERSE){
    // Explicit V2 scope never inherits the legacy production portfolio.
    const clean=require("../engine-v2/research-universe.cjs").parseV2Universe(process.env.VIXALE_V2_RESEARCH_UNIVERSE);
    symbols=clean.symbols;candidates=clean.candidates;
  }else{
    feed=await json("https://www.vixale.com/api/swing-leaders?research="+Date.now());
    if(feed.stale) throw new Error("Public membership source is stale");
    symbols=[...new Set([...feed.active_portfolio.map(x=>x.ticker),...feed.interns.map(x=>x.ticker),"SPY","QQQ","SMH","XLK","XLE"])];
  }
  if(symbols.some(x=>!/^[-A-Z0-9.]{1,15}$/.test(x))||symbols.length>50) throw new Error("Invalid research universe");
  const data=[];
  for(let i=0;i<symbols.length;i+=4) {
    const result=await Promise.allSettled(symbols.slice(i,i+4).map(async symbol=>{
      const source=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
      const raw=await json(source); return { source, ...analyze(raw.chart?.result?.[0],date) };
    }));
    for(const item of result) { if(item.status!=="fulfilled") throw item.reason; data.push(item.value); }
  }
  const body=JSON.stringify({gate:"RESEARCH_INPUTS",result:"PASS",date,collectedAt:new Date().toISOString(),membershipSnapshotDate:feed?.snapshot_date||null,mode:candidates?'CLEAN_EPOCH':'LEGACY',candidates,data},null,2);
  fs.writeFileSync("swing-research-inputs.json",body+"\n");
  console.log(JSON.stringify({gate:"RESEARCH_INPUTS",result:"PASS",date,sha256:crypto.createHash("sha256").update(body).digest("hex"),symbols,metrics:data.map(x=>x.metrics)}));
}
module.exports={analyze};
if(require.main===module) main().catch(e=>{console.error("RESEARCH_INPUTS FAIL:",e.message);process.exitCode=1;});

