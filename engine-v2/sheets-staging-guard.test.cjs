'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifySheetFence}=require('./sheets-staging-guard.cjs');
const base={lease:{scope:'ENGINE2_STAGING',owner:'shadow',fence:3,revision:2},expectedOwner:'shadow',expectedRevision:2,formulasBefore:{A1:'=SUM(1,2)'},formulasAfter:{A1:'=SUM(1,2)'}};
test('staging preflight passes only with fence and unchanged formulas',()=>assert.equal(verifySheetFence(base).status,'STAGING_PREFLIGHT_PASS'));
test('missing lease blocks',()=>assert.equal(verifySheetFence({...base,lease:null}).status,'BLOCKED'));
