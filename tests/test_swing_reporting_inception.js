'use strict';
const assert=require('node:assert/strict');
const {
 REPORTING_INCEPTION_DATE,REPORTING_INCEPTION_TIME_ET,
 REPORTING_BASELINE_MODEL_PNL,rebaseReportingEquity,attachReportingEquity
}=require('../lib/swing-reporting-equity');
const {parseEquityHistory,normalizeEngine2EquityRows,renderModelPnlChart}=require('../lib/swing-leaders');

const rows=[
 ['snapshot_date','snapshot_time_et','realized_model_pnl','unrealized_model_pnl','total_model_pnl','model_equity','active_count'],
 ['2026-10-19','INCEPTION','-','-','-','$100,000.00','0'],
 ['2026-11-05','10:02 ET','($1,011.37)','-','($1,011.37)','$98,988.63','0'],
 ['2026-11-06','10:00 ET','($1,011.37)','-','($1,011.37)','$98,988.63','0'],
 ['2026-11-11','10:01 ET','($1,011.37)','-','($1,011.37)','$98,988.63','4'],
];
const original=parseEquityHistory(normalizeEngine2EquityRows(rows));
const frozen=JSON.stringify(original);
const result=rebaseReportingEquity(original);
assert.equal(REPORTING_INCEPTION_DATE,'2026-11-11');
assert.equal(REPORTING_INCEPTION_TIME_ET,'10:01 ET');
assert.equal(REPORTING_BASELINE_MODEL_PNL,-1011.37);
assert.equal(result.reporting_equity_status,'VERIFIED');
assert.equal(result.reporting_baseline_model_pnl,-1011.37);
assert.deepEqual(result.reporting_equity_history,[
 {snapshot_date:'2026-11-11',snapshot_time_et:'10:01 ET',total_model_pnl:0},
]);
assert.equal(JSON.stringify(original),frozen,'Trading Lab ledger must not be changed');

const after=[...original,
 {snapshot_date:'2026-11-12',snapshot_time_et:'10:00 ET',total_model_pnl:-950},
 {snapshot_date:'2026-11-13',snapshot_time_et:'10:00 ET',total_model_pnl:-1100},
 {snapshot_date:'2026-11-16',snapshot_time_et:'10:00 ET',total_model_pnl:-1011.37},
];
const rebased=rebaseReportingEquity(after);
assert.deepEqual(rebased.reporting_equity_history.map(p=>p.total_model_pnl),[0,61.37,-88.63,0]);
assert.deepEqual(rebased.reporting_equity_history.map(p=>p.snapshot_date),[
 '2026-11-11','2026-11-12','2026-11-13','2026-11-16'
]);
assert.equal(after[0].total_model_pnl,0);
assert.equal(after[3].total_model_pnl,-1011.37);
const projected=attachReportingEquity({available:true,stale:false,data:{
 snapshot_date:'2026-11-11',equity_history:after,
 equity_history_latest_date:'2026-11-16',
}});
assert.equal(projected.data.equity_history.length,7,'raw history preserved for audit');
assert.equal(projected.data.equity_history[3].total_model_pnl,-1011.37);
assert.deepEqual(projected.data.reporting_equity_history,rebased.reporting_equity_history);
assert.equal(projected.data.equity_history_latest_date,'2026-11-16');
assert.equal(projected.data.reporting_baseline_model_pnl,-1011.37);

const chart=renderModelPnlChart(rebased.reporting_equity_history,{reporting:true});
assert.match(chart,/Since Nov 11, 2026/);
assert.match(chart,/2026-11-11 · Reporting inception \(10:01 ET\)/);
assert.match(chart,/2026-11-13 · 10:00 ET/);
assert.match(chart,/Model P&amp;L: \-\$88\.63/);
assert.doesNotMatch(chart,/2026-10-19|2026-11-05/);
assert.doesNotMatch(chart,/>Inception</);

const unavailable=[
 rebaseReportingEquity([]),
 rebaseReportingEquity(original.slice(0,-1)),
 rebaseReportingEquity(original.map(p=>p.snapshot_date==='2026-11-11'?{...p,total_model_pnl:-1011.36}:p)),
 rebaseReportingEquity([...original,original[3]]),
];
for(const item of unavailable){
 assert.equal(item.reporting_equity_status,'BASELINE_UNAVAILABLE');
 assert.deepEqual(item.reporting_equity_history,[]);
 assert.equal(item.reporting_baseline_model_pnl,null);
 const missing=renderModelPnlChart(item.reporting_equity_history,{reporting:true});
 assert.match(missing,/Verified November 11 reporting baseline unavailable/);
 assert.doesNotMatch(missing,/2026-10-19|2026-11-05|\-\$1,011\.37/);
}
assert.deepEqual(attachReportingEquity({available:false,data:null}),{available:false,data:null});
const legacy=renderModelPnlChart(original,{reporting:false});
assert.match(legacy,/Equity History/);
assert.match(legacy,/Inception/);
assert.match(legacy,/2026-10-19/);
console.log('Nov 11 fixed reporting inception, immutable history, missing-baseline guards and legacy chart: PASS');
