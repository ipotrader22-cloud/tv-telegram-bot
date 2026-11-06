'use strict';
// One-shot read-only research probe (2026-11-03). No financial records, simulated prices,
// market execution, client deliveries, provider secrets or service configuration writes.
// The comparison uses public Yahoo v8 with the *same* period1/period2 and headers
// as staging preopen, then checks range=5d separately to distinguish query shapes.
const fs=require('node:fs');
const path=require('node:path');
const START=Date.parse('2026-11-02T15:00:00Z');
const END=Date.parse('2026-11-02T21:00:00Z');
const minute=60000;
const expected=Array.from({length:(END-START)/minute},(_,i)=>(START+i*minute)/1000);
const sample=secs=>new Date(secs*1000).toISOString();
const query=(ticker,mode)=>{
 const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+ticker);
 if(['exact','lookback1m','lookback30m'].includes(mode)){
  url.searchParams.set('interval','1m');
  const lookback=mode==='lookback1m'?60:mode==='lookback30m'?1800:0;
  url.searchParams.set('period1',String(START/1000-lookback));
  url.searchParams.set('period2',String(END/1000));
 }else{
  url.searchParams.set('interval','1m');
  url.searchParams.set('range','5d');
 }
 return url;
};
async function request(ticker,mode,fetchFn=fetch){
 const report={ticker,mode,expectedMinutes:expected.length,source:'Yahoo v8 chart query1',
  checkedAt:new Date().toISOString(),status:'UNVERIFIED'};
 try{
  const response=await fetchFn(query(ticker,mode),{
   headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  report.httpStatus=response.status;
  if(!response.ok){report.status='HTTP_UNAVAILABLE';return report;}
  const raw=await response.json(),chart=raw?.chart?.result?.[0];
  if(!chart||chart.meta?.symbol!==ticker||!Array.isArray(chart.timestamp)){
   report.status='INVALID_OR_MISSING_CHART';return report;
  }
  const q=chart.indicators?.quote?.[0];
  if(!q||![q.open,q.high,q.low,q.close,q.volume].every(a=>Array.isArray(a)&&a.length===chart.timestamp.length)){
   report.status='INVALID_OHLCV_VECTOR';return report;
  }
  const actual=new Set(),duplicated=[],nonaligned=[],badBars=[],outside=[];
  for(let i=0;i<chart.timestamp.length;i++){
   const sec=chart.timestamp[i];
   if(!Number.isSafeInteger(sec)){badBars.push('UNSAFE_TIMESTAMP');continue;}
   const ms=sec*1000;
   if(ms<START||ms>=END){outside.push(sec);continue;}
   if(ms%minute!==0){nonaligned.push(sec);continue;}
   if(actual.has(sec)){duplicated.push(sec);continue;}
   const v=[q.open[i],q.high[i],q.low[i],q.close[i],q.volume[i]];
   if(v.some(x=>typeof x!=='number'||!Number.isFinite(x))||
     v.slice(0,4).some(x=>x<=0)||v[4]<=0||
     v[1]<Math.max(v[0],v[2],v[3])||v[2]>Math.min(v[0],v[1],v[3])){
     badBars.push(sample(sec));continue;
   }
   actual.add(sec);
  }
  const missing=expected.filter(sec=>!actual.has(sec));
  report.status=missing.length===0&&duplicated.length===0&&nonaligned.length===0?
   'COMPLETE_COVERAGE':'INCOMPLETE_COVERAGE';
  report.rawTimestampCount=chart.timestamp.length;
  report.validTargetMinutes=actual.size;
  report.missingMinuteCount=missing.length;
  report.missingMinuteSample=missing.slice(0,12).map(sample);
  report.firstValidTargetMinute=actual.size?sample(Math.min(...actual)):null;
  report.lastValidTargetMinute=actual.size?sample(Math.max(...actual)):null;
  report.duplicateCount=duplicated.length;
  report.nonMinuteCount=nonaligned.length;
  report.invalidValueCount=badBars.length;
  report.outsideRequestedWindowCount=outside.length;
  report.vendorDelaySeconds=Number.isFinite(chart.meta?.exchangeDataDelayedBy)?
   chart.meta.exchangeDataDelayedBy*60:null;
  // Do NOT output raw payload or prices.
 }catch(e){
  report.status=e?.name==='TimeoutError'?'REQUEST_TIMEOUT':'REQUEST_OR_JSON_FAILED';
  report.errorType=e?.name==='TimeoutError'?'TimeoutError':'REDACTED';
 }
 return report;
}
async function main(){
 const checkedAt=new Date().toISOString();
 const results=[];
 for(const ticker of ['CVX','XOM']){
  for(const mode of ['exact','lookback1m','lookback30m','range5d'])
   results.push(await request(ticker,mode));
 }
 const report={session:'2026-11-02',market:'NYSE',runContext:'PREOPEN_2026-11-03',
  windowUtc:{start:new Date(START).toISOString(),end:new Date(END).toISOString()},
  checkedAt,runOn:'GITHUB_ACTIONS_NOT_RENDER',results,
  note:'External runner network and historical reconstruction cannot certify Render egress at 09:00 ET.'};
 fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'out','yahoo-nov02-minute-coverage.json'),
  JSON.stringify(report,null,2)+'\n');
 console.log('YAHOO_NOV02_MINUTE_COVERAGE='+JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{
 console.log('YAHOO_NOV02_MINUTE_COVERAGE={"status":"PROBE_FAILED_REDACTED"}');
 process.exitCode=1;
});
module.exports={request};
