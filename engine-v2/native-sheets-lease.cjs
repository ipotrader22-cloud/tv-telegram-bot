'use strict';
// Google Sheets native developerMetadata lease/fence for Engine2 STAGING only.
// This builder contains no API calls. Live source workbook ID is rejected.
const {randomUUID}=require('node:crypto');
const STAGING_ID='1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA';
const SOURCE_ID='14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc';
const LEASE_ID=1030100,FENCE_ID=1030101;
const LEASE_KEY='VIXALE_SWING_LEASE_V1',FENCE_KEY='VIXALE_SWING_FENCE_V1';
function ensureStaging(id){
 if(id!==STAGING_ID||id===SOURCE_ID)throw Error('PRODUCTION_SHEET_WRITES_FORBIDDEN');
 return id;
}
const meta=(id,key,value)=>({metadataId:id,metadataKey:key,metadataValue:value,location:{spreadsheet:true},visibility:'DOCUMENT'});
const lookup=(key,value)=>({developerMetadataLookup:{metadataKey:key,metadataValue:value}});
function classifyMetadata({spreadsheetId,developerMetadata=[]}={}){
 ensureStaging(spreadsheetId);
 const fence=developerMetadata.filter(x=>x.metadataId===FENCE_ID||x.metadataKey===FENCE_KEY);
 const leases=developerMetadata.filter(x=>x.metadataId===LEASE_ID||x.metadataKey===LEASE_KEY);
 if(fence.length!==1||fence[0].metadataId!==FENCE_ID||fence[0].metadataKey!==FENCE_KEY||!fence[0].metadataValue)
  return {status:'BLOCKED',reason:'FENCE_MISSING_OR_CONFLICTING'};
 if(leases.length>1||leases.some(x=>x.metadataId!==LEASE_ID||x.metadataKey!==LEASE_KEY))
  return {status:'BLOCKED',reason:'LEASE_METADATA_CONFLICT'};
 return {status:'PASS',fence:fence[0].metadataValue,lease:leases[0]?.metadataValue||null};
}
function newLease({owner,now=Date.now(),ttlMs=120000,nonce=randomUUID()}={}){
 if(!owner||!Number.isFinite(now)||ttlMs!==120000||!nonce)throw Error('INVALID_LEASE');
 return JSON.stringify({owner,nonce,expiresAt:new Date(now+ttlMs).toISOString()});
}
function acquireRequests({state,newLeaseValue,now=Date.now()}={}){
 if(state?.status!=='PASS'||!newLeaseValue)return {status:'BLOCKED',reason:'FENCE_UNVERIFIED'};
 const requests=[];
 if(state.lease){
  let old;try{old=JSON.parse(state.lease)}catch{return {status:'BLOCKED',reason:'INVALID_EXISTING_LEASE'}}
  const expire=Date.parse(old?.expiresAt||'');
  if(!Number.isFinite(expire)||expire>now)return {status:'BLOCKED',reason:'LEASE_OCCUPIED_OR_INVALID'};
  requests.push({deleteDeveloperMetadata:{dataFilter:lookup(LEASE_KEY,state.lease)}});
 }
 requests.push({createDeveloperMetadata:{developerMetadata:meta(LEASE_ID,LEASE_KEY,newLeaseValue)}});
 return {status:'READY_FOR_ACQUIRE',requests};
}
function guardedBatch({state,ownedLease,newLeaseValue,newRevision,financialRequests=[]}={}){
 if(state?.status!=='PASS'||state.lease!==ownedLease||!ownedLease||!newLeaseValue||
    !newRevision||!Array.isArray(financialRequests)||!financialRequests.length)throw Error('GUARDED_COMMIT_PRECONDITION');
 if(financialRequests.some(x=>Object.keys(x).length!==1||x.deleteDeveloperMetadata||x.createDeveloperMetadata))
  throw Error('FINANCIAL_REQUESTS_MUST_NOT_OVERRIDE_LOCK');
 // The duplicate explicit IDs make a wrong expected fence/lease abort
 // the entire Google Sheets batch atomically, including financial writes.
 return [
 {deleteDeveloperMetadata:{dataFilter:lookup(FENCE_KEY,state.fence)}},
 {createDeveloperMetadata:{developerMetadata:meta(FENCE_ID,FENCE_KEY,newRevision)}},
 {deleteDeveloperMetadata:{dataFilter:lookup(LEASE_KEY,ownedLease)}},
 {createDeveloperMetadata:{developerMetadata:meta(LEASE_ID,LEASE_KEY,newLeaseValue)}},
 ...financialRequests
 ];
}
function releaseRequests({state,ownedLease}={}){
 if(state?.status!=='PASS'||!ownedLease||state.lease!==ownedLease)throw Error('RELEASE_LEASE_NOT_OWNED');
 return [{deleteDeveloperMetadata:{dataFilter:lookup(LEASE_KEY,ownedLease)}}];
}
module.exports={STAGING_ID,SOURCE_ID,LEASE_ID,FENCE_ID,LEASE_KEY,FENCE_KEY,ensureStaging,meta,classifyMetadata,newLease,acquireRequests,guardedBatch,releaseRequests};
