'use strict';
// Issue #388 independent read-only provider diagnostic. No DB, Sheets, trading or customer requests.
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
const {localET}=require('./market-data-adapter.cjs');
async function probe({clock=()=>new Date(),symbols=['AIZ','EXR','PSA','VTRS']}={}){
 const now=clock(),date=localET(now.toISOString()).date,source=createGoogleChartSource();
 const results=[];
 for(const ticker of symbols){
  try{
   const data=await source.getMinuteHistory({ticker,fromDate:date,throughDate:date});
   const bars=data.bars||[],future=bars.filter(b=>Date.parse(b.end)>now.getTime()),last=bars.filter(b=>Date.parse(b.end)<=now.getTime()).at(-1),age=last?now.getTime()-Date.parse(last.end):null;
   results.push({ticker,status:last&&age>=0&&age<=20*60000?'FRESH_MINUTE_BAR':'STALE_OR_UNAVAILABLE',
    source:'GOOGLE_FINANCE_CHART_1M',bars:bars.length,futureBarsIgnored:future.length,
    lastTimeUtc:last?.end||null,lastTimeET:last?localET(last.end):null,
    lastClose:last?.close??null,ageSeconds:Number.isFinite(age)?Math.round(age/1000):null});
  }catch(error){
   const approved=new Set(['GOOGLE_CHART_ACCESS_RESTRICTED','GOOGLE_CHART_UPSTREAM_UNAVAILABLE','GOOGLE_CHART_RESPONSE_INVALID',
    'GOOGLE_CHART_SERIES_MISSING','GOOGLE_CHART_SYMBOL_UNVERIFIED','GOOGLE_CHART_TRANSPORT_FAILED','GOOGLE_CHART_REQUEST_INVALID']);
   results.push({ticker,status:'BLOCKED',reason:approved.has(error?.message)?error.message:'GOOGLE_CHART_EVIDENCE_UNAVAILABLE'});
  }
 }
 return {mode:'READ_ONLY',at:now.toISOString(),date,results};
}
if(require.main===module)probe().then(v=>console.log(JSON.stringify(v))).catch(()=>{console.log(JSON.stringify({status:'BLOCKED',reason:'GOOGLE_CHART_PROBE_FAILED'}));process.exitCode=1});
module.exports={probe};
