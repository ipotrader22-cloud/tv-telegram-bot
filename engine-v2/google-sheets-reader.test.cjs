'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {serviceAccount,sheetsReader,SCOPES}=require('./google-sheets-reader.cjs');
test('never accepts non-service-account credentials',()=>assert.throws(()=>serviceAccount({type:'authorized_user'}),/Invalid/));
test('read-only OAuth scope cannot write spreadsheets',()=>{assert.equal(SCOPES,'https://www.googleapis.com/auth/spreadsheets.readonly');assert.ok(!SCOPES.includes('drive.'))});
test('malformed and unauthorized ranges are rejected before any network request',async()=>{
 const pem='-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----';
 const reader=sheetsReader({credentials:{type:'service_account',client_email:'test@example.iam.gserviceaccount.com',private_key:pem,token_uri:'https://oauth2.googleapis.com/token'},fetchImpl:async()=>{throw Error('Should not fetch')}});
 await assert.rejects(reader.read(['Portfolio!A1:C3']),/Unauthorized/);
 await assert.rejects(reader.read(["'Closed Trades'!A1:C2;DELETE"]),/Unauthorized/);
});
