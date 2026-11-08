'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {INDEX_POLICY,indexUniverse,SECTOR_BENCHMARKS}=require('./index-universe.cjs');
const {parseV2Universe}=require('./research-universe.cjs');
const {boundedMap}=require('./bounded-map.cjs');
const {validateUniverseCoverage}=require('./universe-coverage.cjs');
const {createResearchRuntime}=require('./staging-research-runtime.cjs');
const {googleIdentity}=require('./google-finance-chart-source.cjs');
const {sessionEvidence}=require('./nyse-session-adapter.cjs');
const {session}=require('../scripts/swing-market-calendar');
const date='2026-11-09',at=date+'T12:00:00Z';
function fixture(){
 const dates=[];for(let d=new Date('2026-01-01T16:00:00Z');d.toISOString().slice(0,10)<date;d=new Date(+d+86400000))
  if(session(d.toISOString().slice(0,10)).open)dates.push(d.toISOString());
 const fetchFn=async(url,options)=>{
  if(String(url).startsWith('https://news.google.com/'))return {ok:true,text:async()=>'<rss><channel></channel></rss>'};
  const entities=JSON.parse(JSON.parse(options.body.get('f.req'))[0][0][1])[0];
  const series=entities.filter(e=>e[1][0]!=='HLT').map(e=>{
   const ticker=e[1][0],days=ticker==='SPCX'?dates.slice(-103):dates;
   return [e[1],null,null,[[null,null,days.map((time,i)=>{
    const close=100+i*.1+(i%2?1:-1);return [close,close,close+2,close-2,time,1000+(i%3)*200];
   })]],null,null,null,ticker+' Corporation',86400];
  });
  return {ok:true,status:200,text:async()=>")]}'\n"+JSON.stringify([['wrb.fr','c2u4wc',JSON.stringify([series])]])};
 };
 return {fetchFn};
}
test('index union deduplicates share-class tickers, retains both memberships and maps all sectors',()=>{
 const u=parseV2Universe(INDEX_POLICY);assert.equal(u.candidates.length,518);assert.equal(new Set(u.candidates).size,518);
 assert.deepEqual(u.membership.counts,{SP500:503,NASDAQ100:101,overlap:86,union:518});
 assert.equal(new Set(Object.values(u.sectorByTicker)).size,SECTOR_BENCHMARKS.length);
 assert.deepEqual(googleIdentity('BRK.B'),['BRK.B','NYSE']);assert.deepEqual(googleIdentity('CBOE'),['CBOE','BATS']);
 assert.equal(u.candidates.includes('SPY'),false);assert.equal(u.legacyPortfolioUsed,false);
 const snapshot=structuredClone(require('./data/sp500-nasdaq100.json'));snapshot.members.push(snapshot.members[0]);
 assert.throws(()=>indexUniverse(snapshot),/MEMBER_INVALID/);
});
test('bounded fetch preserves ordering, concurrency and stops admitting work on provider denial',async()=>{
 let active=0,peak=0;const r=await boundedMap([1,2,3,4,5,6],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return n*2});
 assert.deepEqual(r,[2,4,6,8,10,12]);assert.equal(peak,2);
 let started=0;await assert.rejects(boundedMap(Array(50).fill(1),4,async()=>{started++;throw Error('DENIED')}),/DENIED/);assert.equal(started,4);
});
test('all-index source pipeline attests every reviewed member or explicit unscored exclusion',async()=>{
 const p=await createResearchRuntime({universeCsv:INDEX_POLICY,sourcePolicy:'GOOGLE',completedSessionOnly:true,
  clock:()=>new Date(at),...fixture()})({date});
 const a=p.collection.artifact;assert.equal(a.data.length,516+14);assert.equal(p.collection.news.tickers.length,516);
 assert.deepEqual(a.universeCoverage.exclusions.map(e=>e.ticker),['HLT','SPCX']);
 validateUniverseCoverage(a,{required:true});
 const batch=await p.researchProvider.getBatch({date,runAt:at,session:sessionEvidence(date)});
 assert.equal(batch.items.length,516);assert.equal(batch.benchmarks.length,14);
 assert.equal(batch.items.some(x=>['HLT','SPCX'].includes(x.ticker)),false);
 for(const b of batch.items){assert.equal(b.score,Object.values(b.factors).reduce((a,b)=>a+b,0));assert.equal(b.factors.catalyst,0);}
 for(const mutate of [x=>x.universeCoverage.exclusions.pop(),x=>x.universeCoverage.exclusions[1].completedDailyBars=200,
  x=>x.universeCoverage.membership.hash='bad',x=>x.universeCoverage.reviewed.push('HLT')]){
  const copy=structuredClone(a);mutate(copy);assert.throws(()=>validateUniverseCoverage(copy,{required:true}),/COVERAGE_INVALID/);
 }
 const {assertUniverseConfiguration}=require('./staging-worker.cjs');
 assert.throws(()=>assertUniverseConfiguration({batch:{sourceEvidence:{artifact:{}}}},{VIXALE_V2_RESEARCH_UNIVERSE:INDEX_POLICY}),/COVERAGE_MISSING/);
});
test('HTTP quota or access failure never becomes a per-stock exclusion',async()=>{
 for(const status of [403,429,503])await assert.rejects(createResearchRuntime({universeCsv:INDEX_POLICY,
  sourcePolicy:'GOOGLE',completedSessionOnly:true,clock:()=>new Date(at),fetchFn:async()=>({ok:false,status})})({date}));
});
