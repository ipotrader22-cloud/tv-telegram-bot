'use strict';
// Real-source readiness probe only: no database, workbook write, model event or email.
const {INDEX_POLICY,indexUniverse}=require('./index-universe.cjs');
const {createResearchRuntime}=require('./staging-research-runtime.cjs');
const {validateUniverseCoverage}=require('./universe-coverage.cjs');
const {autoAssess}=require('./automated-factor-assessor.cjs');
const {localET}=require('./market-data-adapter.cjs');
async function probe({clock=()=>new Date(),fetchFn=fetch}={}){
 const started=clock(),date=localET(started.toISOString()).date;
 const {collection:{artifact,news}}=await createResearchRuntime({universeCsv:INDEX_POLICY,
  sourcePolicy:'GOOGLE',completedSessionOnly:true,clock,fetchFn})({date});
 validateUniverseCoverage(artifact,{required:true});
 const assessed=autoAssess({artifact,date,runAt:clock().toISOString(),universe:artifact.candidates,
  sectorByTicker:indexUniverse().sectorByTicker,newsReview:news});
 return {status:assessed.complete?'PASS':'BLOCKED',reason:assessed.reason||null,
  checkedAt:clock().toISOString(),sourceSession:artifact.data[0]?.metrics.lastCompleteDate,
  membership:artifact.universeCoverage.membership,requested:artifact.universeCoverage.requested.length,
  scored:assessed.assessments?.length||0,newsReviewed:news.tickers.length,
  exclusions:artifact.universeCoverage.exclusions.map(e=>({ticker:e.ticker,reason:e.reason,
   ...(e.completedDailyBars?{completedDailyBars:e.completedDailyBars}:{})})),
  benchmarkCount:artifact.benchmarks.length,seconds:(clock()-started)/1000,
  writesPerformed:false,marketCycleCertified:false};
}
module.exports={probe};
if(require.main===module)probe().then(r=>{console.log(JSON.stringify(r));if(r.status!=='PASS')process.exitCode=1})
 .catch(()=>{console.log(JSON.stringify({status:'BLOCKED',reason:'INDEX_SOURCE_COLLECTION_FAILED',writesPerformed:false}));process.exitCode=1});
