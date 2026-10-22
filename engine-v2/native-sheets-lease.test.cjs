'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {STAGING_ID,SOURCE_ID,LEASE_ID,FENCE_ID,classifyMetadata,newLease,acquireRequests,guardedBatch,releaseRequests,ensureStaging}=require('./native-sheets-lease.cjs');
const fence={metadataId:FENCE_ID,metadataKey:'VIXALE_SWING_FENCE_V1',metadataValue:'revision-1'};
const initial=classifyMetadata({spreadsheetId:STAGING_ID,developerMetadata:[fence]});
test('reject legacy production target even if it has valid fence',()=>assert.throws(()=>ensureStaging(SOURCE_ID)));
test('require exact staging fence and detect metadata collisions',()=>{assert.equal(initial.status,'PASS');assert.equal(classifyMetadata({spreadsheetId:STAGING_ID}).status,'BLOCKED')});
test('free lease can be acquired with explicit stable ID',()=>{
 const x=acquireRequests({state:initial,newLeaseValue:newLease({owner:'shadow'})});
 assert.equal(x.status,'READY_FOR_ACQUIRE');assert.equal(x.requests[0].createDeveloperMetadata.developerMetadata.metadataId,LEASE_ID);
});
test('active lease cannot be stolen and invalid expiry blocks',()=>{
 const lease=newLease({owner:'other',now:Date.now()});
 const state={...initial,lease};assert.equal(acquireRequests({state,newLeaseValue:'new'}).status,'BLOCKED');
});
test('atomic batch carries both exact expected metadata guards before financial writes',()=>{
 const lease=newLease({owner:'engine2'}),state={...initial,lease};
 const batch=guardedBatch({state,ownedLease:lease,newLeaseValue:newLease({owner:'engine2'}),newRevision:'revision-2',financialRequests:[{updateCells:{fields:'userEnteredValue'}}]});
 assert.equal(batch.length,5);assert.equal(batch[0].deleteDeveloperMetadata.dataFilter.developerMetadataLookup.metadataValue,'revision-1');
 assert.equal(batch[2].deleteDeveloperMetadata.dataFilter.developerMetadataLookup.metadataValue,lease);
});
test('release requires owning exact lease value',()=>{const lease='owner';assert.throws(()=>releaseRequests({state:{...initial,lease},ownedLease:'other'}))});
