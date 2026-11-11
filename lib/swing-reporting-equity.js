'use strict';

// Approved public reporting epoch, based on the actual verified Trading Lab
// Equity History row (2026-11-11 at 10:01 ET, cumulative -$1,011.37).
// Reporting is a read-only presentation projection; never edit source history.
const REPORTING_INCEPTION_DATE='2026-11-11';
const REPORTING_INCEPTION_TIME_ET='10:01 ET';
const REPORTING_BASELINE_MODEL_PNL=-1011.37;

function rebaseReportingEquity(source) {
  const unavailable={
    reporting_inception_date:REPORTING_INCEPTION_DATE,
    reporting_inception_time_et:REPORTING_INCEPTION_TIME_ET,
    reporting_equity_status:'BASELINE_UNAVAILABLE',
    reporting_baseline_model_pnl:null,
    reporting_equity_history:[],
  };
  if(!Array.isArray(source)||!source.length)return unavailable;
  const matches=source.map((row,i)=>({row,i})).filter(({row})=>
    row?.snapshot_date===REPORTING_INCEPTION_DATE&&
    row.snapshot_time_et===REPORTING_INCEPTION_TIME_ET);
  if(matches.length!==1)return unavailable;
  const anchor=matches[0];
  if(!Number.isFinite(anchor.row.total_model_pnl)||
     Math.abs(anchor.row.total_model_pnl-REPORTING_BASELINE_MODEL_PNL)>0.005)
    return unavailable;
  // The existing strict Equity History parser has already validated the
  // source's dates, uniqueness, chronology, and original INCEPTION point.
  const points=source.slice(anchor.i).map((p,i)=>{
    if(!/^20\d\d-\d\d-\d\d$/.test(p.snapshot_date)||
       !Number.isFinite(p.total_model_pnl)||
       p.snapshot_date<REPORTING_INCEPTION_DATE)throw Error('REPORTING_EQUITY_SOURCE_INVALID');
    const delta=Math.round((p.total_model_pnl-REPORTING_BASELINE_MODEL_PNL+Number.EPSILON)*100)/100;
    return {
      snapshot_date:p.snapshot_date,
      snapshot_time_et:p.snapshot_time_et,
      total_model_pnl:i===0?0:delta,
    };
  });
  return {
    reporting_inception_date:REPORTING_INCEPTION_DATE,
    reporting_inception_time_et:REPORTING_INCEPTION_TIME_ET,
    reporting_equity_status:'VERIFIED',
    reporting_baseline_model_pnl:REPORTING_BASELINE_MODEL_PNL,
    reporting_equity_history:points,
  };
}
function attachReportingEquity(result){
  if(!result?.available||!result.data)return result;
  return {...result,data:{
    ...result.data,
    ...rebaseReportingEquity(result.data.equity_history),
  }};
}
module.exports={REPORTING_INCEPTION_DATE,REPORTING_INCEPTION_TIME_ET,
 REPORTING_BASELINE_MODEL_PNL,rebaseReportingEquity,attachReportingEquity};
