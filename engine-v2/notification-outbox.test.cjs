'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notificationIntent}=require('./notification-outbox.cjs');
test('verified readback retains staging identity',()=>{
 const manifest={fingerprint:'a'.repeat(64),payload:{runId:'engine2|2026-10-19|2026-10-21|morning'}};
 const verification={status:'VERIFIED',snapshotId:manifest.fingerprint,runId:manifest.payload.runId};
 const result=notificationIntent({manifest,verification,recipient:'fixture'});
 assert.equal(result.status,'STAGING_ONLY');
 assert.equal(result.snapshotId,manifest.fingerprint);
 assert.equal(result.recipient,'fixture');
 assert.equal(result.deliveryEnabled,false);
});

test('absent fingerprint cannot stage delivery',()=>{
 const manifest={payload:{runId:'engine2|2026-10-19|2026-10-21|morning'}};
 const verification={status:'VERIFIED',runId:manifest.payload.runId};
 assert.equal(notificationIntent({manifest,verification,recipient:'fixture'}).status,'BLOCKED');
});
