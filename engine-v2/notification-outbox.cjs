'use strict';
// Pure outbox key; delivery is disabled in shadow.
function notificationIntent({verification,manifest,recipient}={}){
 if(verification?.status!=='VERIFIED'||manifest?.fingerprint!==verification.snapshotId||!verification.snapshotId)return {status:'BLOCKED'};
 if(verification.runId!==manifest.payload?.runId||!recipient)return {status:'BLOCKED'};
 return {status:'STAGING_ONLY',deliveryEnabled:false,key:verification.runId+'|'+recipient,runId:verification.runId,snapshotId:verification.snapshotId,recipient};
}
module.exports={notificationIntent};
