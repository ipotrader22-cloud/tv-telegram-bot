'use strict';
// Computed market facts only; analyst-assigned nine factor points remain separate.
// No live trades, no fabricated company catalysts, and no inferred score.
const {validateResearch}=require('./research-gate.cjs');
function metrics({ticker,bars,benchmarkBars,sectorBars,reviewDate}){
 if(!/^[A-Z.-]+$/.test(ticker)||!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate))throw Error('Invalid research identity');
 const validate=(series,label)=>{if(!Array.isArray(series)||series.length<200)throw Error(label+' needs 200 completed bars');let last='';for(const b of series){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||b.day>=reviewDate||b.day<=last||![b.open,b.high,b.low,b.close,b.volume].every(v=>Number.isFinite(v)&&v>0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error(label+' invalid completed OHLCV');last=b.day;}return series};
 const a=validate(bars,'stock'),m=validate(benchmarkBars,'market'),s=validate(sectorBars,'sector');
 const overlap=(x,y)=>{const prior=new Map(y.map(b=>[b.day,b]));return x.filter(b=>prior.has(b.day)).map(b=>({date:b.day,stock:b,other:prior.get(b.day)}))};
 const relative=(x,y,n)=>{const aligned=overlap(x,y);if(aligned.length<n+1||aligned.at(-1).date!==x.at(-1).day||aligned.at(-1).date!==y.at(-1).day)throw Error('Insufficient or stale aligned trading sessions');const z=aligned.slice(-n-1);const stock=z.at(-1).stock.close/z[0].stock.close-1;const base=z.at(-1).other.close/z[0].other.close-1;return {stockReturn:stock,benchmarkReturn:base,excessReturn:stock-base,through:z.at(-1).date}};
 const mean=(z)=>z.reduce((a,b)=>a+b,0)/z.length;
 const window=a.slice(-20),latest=a.at(-1),sma=n=>mean(a.slice(-n).map(b=>b.close));
 const ranges=a.slice(-50),baseHigh=Math.max(...ranges.map(b=>b.high)),baseLow=Math.min(...ranges.map(b=>b.low));
 const earlier=a.slice(-21,-1),priorVolume=mean(earlier.map(b=>b.volume));
 return Object.freeze({ticker,asOf:latest.day,reviewDate,completedBars:a.length,close:latest.close,market:relative(a,m,20),sector:relative(a,s,20),leadership:relative(a,m,60),technical:{sma20:sma(20),sma50:sma(50),sma200:sma(200),above20:latest.close>sma(20),above50:latest.close>sma(50),above200:latest.close>sma(200),range50High:baseHigh,range50Low:baseLow,compression50:(baseHigh-baseLow)/baseHigh,relativeVolume:latest.volume/priorVolume,prior20DayHigh:Math.max(...earlier.map(b=>b.high))},scoring:'REQUIRES_DOCUMENTED_ANALYST_FACTORS'});
}
function assess(input){const x=validateResearch(input,{reviewDate:input.reviewDate});return {...x,facts:metrics({ticker:input.ticker,bars:input.bars,benchmarkBars:input.benchmarkBars,sectorBars:input.sectorBars,reviewDate:input.reviewDate})}}
module.exports={metrics,assess};
