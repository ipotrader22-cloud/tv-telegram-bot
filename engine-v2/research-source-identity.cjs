'use strict';
// Strictly scoped daily research source identity for the isolated Engine 2
// Google experiment. Legacy Yahoo-source proofs remain accepted in old policy.
const {SYMBOLS}=require('./google-finance-chart-source.cjs');
function validatedResearchSource(row){
 const ticker=row?.metrics?.symbol;
 if(!ticker||typeof row.source!=='string')return null;
 if(/^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(row.source))
  return row.source;
 if(row.source==='GOOGLE_FINANCE_CHART_1DAY'&&
    Object.hasOwn(SYMBOLS,ticker)&&row.exchange===SYMBOLS[ticker]&&
    typeof row.companyName==='string'&&row.companyName.trim().length>=3&&
    /^[0-9a-f]{64}$/.test(row.rawHash||''))
  return row.source+':'+ticker+':'+row.rawHash;
 return null;
}
module.exports={validatedResearchSource};
