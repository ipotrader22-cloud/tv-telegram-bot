'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retrieveDocument,trust}=require('./company-document-reader.cjs');
const source={url:'https://www.sec.gov/Archives/edgar/data/1321655/test',sourceType:'SEC_FILING',publishedDate:'2026-08-03'};
const fetchImpl=async()=>({ok:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>'<html><main>Palantir Technologies Inc. Form 8-K report August 3, 2026. The registrant reports operating results to shareholders and the public.</main></html>'});
test('dated SEC source recorded only as retrieved, with fingerprint',async()=>{const x=await retrieveDocument({ticker:'PLTR',reviewDate:'2026-10-12',source,fetchImpl});assert.equal(x.status,'RETRIEVED_NOT_FACT_VERIFIED');assert.equal(x.contentSha256.length,64)});
test('future filing rejected for old replay date',async()=>await assert.rejects(retrieveDocument({ticker:'PLTR',reviewDate:'2026-07-12',source,fetchImpl}),/not available/));
test('source host must really belong to SEC',()=>assert.equal(trust('https://sec.gov.example.com/evil','SEC_FILING'),false));
test('failed HTTP response fails closed',async()=>await assert.rejects(retrieveDocument({ticker:'PLTR',reviewDate:'2026-10-12',source,fetchImpl:async()=>({ok:false,status:403})}),/HTTP 403/));
