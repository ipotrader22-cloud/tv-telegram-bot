'use strict';
const {createHash}=require('node:crypto');
const snapshot=require('./data/sp500-nasdaq100.json');
const INDEX_POLICY='SP500_NASDAQ100_V1';
const SECTOR_BENCHMARKS=['SMH','XLK','XLE','XLC','XLY','XLP','XLF','XLV','XLI','XLB','XLRE','XLU'];
function indexUniverse(data=snapshot){
 if(data?.schemaVersion!==1||data.policy!==INDEX_POLICY||!Array.isArray(data.members))
  throw Error('INDEX_UNIVERSE_INVALID');
 const members=data.members,seen=new Set();
 for(const m of members){
  if(!/^[A-Z][A-Z0-9.]{0,14}$/.test(m.ticker||'')||seen.has(m.ticker)||
     !['NASDAQ','NYSE','BATS'].includes(m.exchange)||!SECTOR_BENCHMARKS.includes(m.sectorBenchmark)||
     !m.name||!m.indices?.length||new Set(m.indices).size!==m.indices.length||
     m.indices.some(i=>!['SP500','NASDAQ100'].includes(i)))throw Error('INDEX_UNIVERSE_MEMBER_INVALID');
  seen.add(m.ticker);
 }
 const counts={SP500:members.filter(m=>m.indices.includes('SP500')).length,
  NASDAQ100:members.filter(m=>m.indices.includes('NASDAQ100')).length,
  overlap:members.filter(m=>m.indices.length===2).length,union:members.length};
 if(counts.SP500<490||counts.SP500>510||counts.NASDAQ100<95||counts.NASDAQ100>110||
    Object.keys(counts).some(k=>data.counts?.[k]!==counts[k]))throw Error('INDEX_UNIVERSE_COVERAGE_INVALID');
 const candidates=members.map(m=>m.ticker),benchmarks=['SPY','QQQ',...SECTOR_BENCHMARKS];
 return {candidates,benchmarks,symbols:[...candidates,...benchmarks],
  sectorByTicker:Object.fromEntries(members.map(m=>[m.ticker,m.sectorBenchmark])),
  exchanges:Object.fromEntries(members.map(m=>[m.ticker,m.exchange])),
  source:INDEX_POLICY,legacyPortfolioUsed:false,
  membership:{policy:INDEX_POLICY,verifiedAt:data.verifiedAt,holdingsAsOf:data.holdingsAsOf,
   counts,hash:createHash('sha256').update(JSON.stringify(data)).digest('hex')}};
}
module.exports={INDEX_POLICY,SECTOR_BENCHMARKS,indexUniverse};
