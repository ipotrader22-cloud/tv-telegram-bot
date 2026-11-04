'use strict';
// Next-session independent source proof. Historical 11/02-11/04 XOM/CVX,
// 09:31 minute target scan and daily OPEN STOP, no account credentials/writes.
const {createGoogleChartSource}=require('./google-finance-chart-source.cjs');
const {googleHistoricalExit}=require('./google-target-window.cjs');
const {etTime}=require('./delayed-model-policy.cjs');
async function run(source=createGoogleChartSource()){
 const date='2026-11-05',fromDate='2026-11-02',throughDate='2026-11-04';
 const cutoff=etTime(throughDate,960),tickets=['CVX','XOM'];
 const daily=await source.getDailyMany({tickers:tickets,date});
 const checks=[];
 for(const ticker of tickets){
  const sourceRow=daily.find(x=>x.ticker===ticker);
  const candles=await source.getMinuteHistory({ticker,fromDate,throughDate});
  const dailyBars=sourceRow?.chart.timestamp.map((t,i)=>({
   date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t*1000)),
   open:sourceRow.chart.indicators.quote[0].open[i]
  }));
  const position={ticker,entryDate:fromDate,entryTime:etTime(fromDate,600),
   lastTargetCheckedAt:etTime(fromDate,600),entryPrice:1e8};
  // Deliberately unattainable target/STOP level: verify coverage but never
  // assert a real trade; price values are private and not printed.
  let status='PASS',reason=null;
  try{googleHistoricalExit({position,through:cutoff,bars:candles.bars,dailyBars})}
  catch(e){status='BLOCKED';reason=/^GOOGLE_[A-Z_]+$/.test(e?.message||'')?e.message:'SOURCE_READINESS_UNKNOWN'}
  checks.push({ticker,status,reason,returnedBars:candles.bars.length,
   fromDate,throughDate,modelWrites:false});
 }
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'BLOCKED',
  date,checks,readOnly:true,writesPerformed:false,pricesLogged:false};
}
if(require.main===module)run().then(x=>{console.log('GOOGLE_NOV5_LOT_READINESS',JSON.stringify(x));if(x.status!=='PASS')process.exitCode=1})
 .catch(()=>{console.log('GOOGLE_NOV5_LOT_READINESS',JSON.stringify({status:'BLOCKED',reason:'GOOGLE_SOURCE_UNAVAILABLE'}));process.exitCode=1});
module.exports={run};
