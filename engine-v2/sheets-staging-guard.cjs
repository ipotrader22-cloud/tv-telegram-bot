'use strict';
// Preflight for a future staging-only Sheets batchUpdate; no write capability.
function verifySheetFence({lease,expectedOwner,expectedRevision,formulasBefore,formulasAfter}={}){
 const bad=reason=>({status:'BLOCKED',reason});
 if(!lease||lease.scope!=='ENGINE2_STAGING'||lease.owner!==expectedOwner||
    !Number.isSafeInteger(lease.fence)||lease.fence<=0)return bad('NATIVE_LEASE_FENCE_MISSING');
 if(lease.revision!==expectedRevision)return bad('LEASE_REVISION_MISMATCH');
 if(!formulasBefore||!formulasAfter)return bad('FORMULA_SNAPSHOT_MISSING');
 for(const [cell,formula] of Object.entries(formulasBefore)){
  if(typeof formula!=='string'||!formula.startsWith('=')||formulasAfter[cell]!==formula)return bad('PROTECTED_FORMULA_CHANGED:'+cell);
 }
 return {status:'STAGING_PREFLIGHT_PASS',fence:lease.fence,writeApproved:false};
}
module.exports={verifySheetFence};
