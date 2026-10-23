'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {saveSummary}=require('./compare-history.cjs');
test('rejects unexpected database before connecting',async()=>{await assert.rejects(saveSummary('postgres://a:b@localhost/production',{source:'GOOGLE_SHEETS_READONLY',realizedMatches:true}),/Unexpected database/)});
test('rejects unverified read-only result before connecting',async()=>{await assert.rejects(saveSummary('postgres://a:b@localhost/vixale_engine_v2_shadow_20261016',{source:'GOOGLE_SHEETS_READONLY',realizedMatches:false}),/Unverified comparison/)});
