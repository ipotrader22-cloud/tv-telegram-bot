'use strict';
// Historical evidence replay: never manufactures qualitative score points.
// Enforces 13 canonical reference symbols, original archive, completed daily sessions.
const {reference}=require('./historical-oct12-reference.cjs');
const {metrics}=require('./research-metrics.cjs');
const cutoff='2026-10-09',reviewDate='2026-10-12';
const sectors=Object.freeze({PLTR:'XLK',NVDA:'SMH',DELL:'XLK',PANW:'XLK',AAOI:'SMH',COHR:'SMH',XOM:'XLE',FTNT:'XLK',AMD:'SMH',GLW:'XLK',LITE:'SMH',MRVL:'SMH',TER:'SMH'});
const convert=(entry,ticker)=>{
 if(!entry||!Array.isArray(entry.bars))return null;
 const bars=entry.bars.filter(x=>x.date<=cutoff).map(x=>({ticker,day:x.date,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume,source:'ARCHIVED_OCT12_RESEARCH'}));
 if(bars.length<200||bars.at(-1).day!==cutoff)throw Error('Missing dated completed bars '+ticker);
 return bars;
};
function replayArchived(archive){
 if(archive?.date!==reviewDate||!Array.isArray(archive.data))throw Error('Unexpected October 12 archive');
 const by=new Map();
 for(const x of archive.data){
  const ticker=x?.metrics?.symbol;
  if(!/^[A-Z.-]+$/.test(ticker)||by.has(ticker))throw Error('Invalid or duplicated archived symbol');
  by.set(ticker,x);
 }
 const dossiers=reference.map(r=>{
  const original={ticker:r.ticker,reviewDate,recordedScore:r.score,recordedStatus:r.status,sectorProxy:sectors[r.ticker],benchmarkVerified:false,independentScore:null,scoreMatch:null};
  const stock=convert(by.get(r.ticker),r.ticker);
  if(!stock)return {...original,status:'MISSING_STOCK_OHLCV'};
  const broad=convert(by.get('SPY'),'SPY'),sector=convert(by.get(sectors[r.ticker]),sectors[r.ticker]);
  if(!broad||!sector)return {...original,status:'MISSING_BENCHMARK_OHLCV'};
  const facts=metrics({ticker:r.ticker,bars:stock,benchmarkBars:broad,sectorBars:sector,reviewDate});
  if(facts.asOf!==cutoff)throw Error('Stale final completed trading session');
  return {...original,status:'QUANTITATIVE_EVIDENCE_COMPLETE_QUALITATIVE_REVIEW_PENDING',facts};
 });
 return {mode:'SHADOW_ONLY',reviewDate,cutoff,dossiers,covered:dossiers.length,quantitativeComplete:dossiers.filter(x=>x.facts).length,independentScoresComplete:0};
}
module.exports={replayArchived};
