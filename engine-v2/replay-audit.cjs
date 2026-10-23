'use strict';
// Evaluates historical-replay reconciliation without modifying the original workbook.
const {replay}=require('./replay.cjs');
function auditHistory({closed,active=[],equity=[],asOf,storedRealized,tolerance=0.00001}){
 const r=replay({closed,active,equity,asOf});
 const differences=[];
 if(typeof storedRealized!=='number'||!Number.isFinite(storedRealized)) differences.push({gate:'MISSING_CANONICAL_REALIZED'});
 else if(Math.abs(r.realized-storedRealized)>tolerance) differences.push({gate:'REALIZED_NOT_RECONCILED',expected:storedRealized,actual:r.realized,difference:r.realized-storedRealized});
 for(const warning of r.warnings)differences.push(warning);
 return {status:differences.length===0?'PASS':'BLOCKED',asOf,closedCount:r.closedCount,excludedCount:r.excludedCount,activeCount:r.activeCount,modelRealized:r.realized,differences};
}
module.exports={auditHistory};
