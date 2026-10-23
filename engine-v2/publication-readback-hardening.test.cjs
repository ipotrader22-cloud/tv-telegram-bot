'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparePublicationManifest,verifyPublication}=require('./publication-contract.cjs');
const date='2026-10-19';
const run={status:'SHADOW_COMMITTED',runId:'engine2|2026-10-19|2026-10-19|morning',published:false};
const model={date,epoch:date,status:'VALIDATED_NOT_PUBLISHED',active:2,realized:0,unrealized:0,total:0,equity:100000};
const active=['A','B'].map(ticker=>({ticker,entryDate:date,entryPrice:100,fullReviewDate:date,currentScore:85}));
const notes=active.map(x=>({ticker:x.ticker,reviewDate:date,reviewTimeET:'10:00 ET',briefNote:'Fixture review'}));
const manifest=preparePublicationManifest({run,model,active,notes,sourceEvidenceId:'fixture'});
function good(){const base={snapshotDate:date,activeCount:2,snapshotId:manifest.fingerprint,tickers:['A','B'],reviewDates:[date,date],noStore:true,stale:false};return {sheet:{...base,protectedFormulasVerified:true},api:{...base},html:{...base}}}
test('matching fingerprint and full identity passes readback contract',()=>assert.equal(verifyPublication({manifest,...good()}).status,'VERIFIED'));
test('equal count but wrong ticker blocks',()=>{const x=good();x.html.tickers=['A','C'];assert.equal(verifyPublication({manifest,...x}).reason,'TICKER_MEMBERSHIP_MISMATCH')});
test('missing review date blocks',()=>{const x=good();delete x.api.reviewDates;assert.equal(verifyPublication({manifest,...x}).reason,'STALE_OR_MISSING_REVIEW_DATES')});
test('old snapshot fingerprint blocks',()=>{const x=good();x.sheet.snapshotId=x.api.snapshotId=x.html.snapshotId='old';assert.equal(verifyPublication({manifest,...x}).reason,'UNPROVEN_MANIFEST_FINGERPRINT')});
