'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {commitStagingReviewedModel,STAGING_ID}=require('../scripts/vixale-staging-reviewed-engine');
test('production sheet is never accepted by staging writer',async()=>{
 let calls=0;
 await assert.rejects(()=>commitStagingReviewedModel({
  spreadsheetId:'14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc',runId:'x',kind:'review',
  readFreshSnapshot:async()=>{calls++;return {}},
  buildFinancialRequests:async()=>{calls++;return [{}]},
  validateQuotes:async()=>{calls++;return true},verifiedReviews:[],expectedDate:'2026-10-14'
 }),/staging only/);
 assert.equal(calls,0);
});
test('integration does not bypass missing private review evidence',async()=>{
 await assert.rejects(()=>commitStagingReviewedModel({
  spreadsheetId:STAGING_ID,runId:'x',kind:'review',readFreshSnapshot:async()=>({}),
  buildFinancialRequests:async()=>[{}],validateQuotes:async()=>true
 }),/Missing private research evidence/);
});
