'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {safeStagingReason}=require('./staging-safe-reasons.cjs');
test('exact 09:40 missing versus invalid bar and source failures have stable safe diagnostics',()=>{
 const cases={
  'MODEL_CYCLE:EXACT_0940_BAR_REQUIRED':'STAGING_FIXED_0940_BAR_MISSING',
  'MODEL_CYCLE:ENTRY_0940_QUOTE_MISSING':'STAGING_FIXED_0940_BAR_MISSING',
  'MODEL_CYCLE:INVALID_0940_BAR':'STAGING_FIXED_0940_BAR_INVALID',
  'MODEL_CYCLE:INVALID_OR_DUPLICATE_FIXED_QUOTE':'STAGING_FIXED_0940_BAR_INVALID',
  'MODEL_CYCLE:YAHOO_MINUTE_DATA_HTTP_429':'STAGING_MINUTE_SOURCE_UNAVAILABLE',
  'MODEL_CYCLE:YAHOO_MINUTE_TIMESTAMP_SEQUENCE_INVALID':'STAGING_MINUTE_SOURCE_INVALID',
  'MODEL_CYCLE:PREOPEN_IDENTITY_MISMATCH':'STAGING_PREOPEN_STATE_CONFLICT',
  'MODEL_CYCLE:DELAYED_REVIEW_UNVERIFIED':'STAGING_MODEL_EVIDENCE_INCOMPLETE',
  'RESEARCH_COMPLETED_AFTER_DECISION_WINDOW':'STAGING_DECISION_WINDOW_EXPIRED',
  'SHEET:PROTECTED_FORMULAS_UNVERIFIED':'STAGING_SHEET_VERIFICATION_FAILED',
  'WEBSITE:EXACT_API_SNAPSHOT_MISMATCH':'STAGING_WEBSITE_PARITY_FAILED',
  'WEBSITE:TRANSIENT_READBACK_UNAVAILABLE':'STAGING_WEBSITE_ENDPOINT_TEMPORARILY_UNAVAILABLE'
 };
 for(const [input,expected] of Object.entries(cases))assert.equal(safeStagingReason(input),expected);
});
test('unknown provider diagnostics and malicious strings cannot reach cron',()=>{
 for(const input of [undefined,null,{},'provider-secret','MODEL_CYCLE:private-key-abc',
  'MODEL_CYCLE:YAHOO_MINUTE_DATA_HTTP_429?token=private-key',
  'SHEET:secret=private-key','WEBSITE:token=private-key']){
  const output=safeStagingReason(input);
  assert.match(output,/^STAGING_[A-Z0-9_]+$/);
  assert.ok(!output.includes('private-key'));
  assert.ok(!output.includes('secret'));
 }
 assert.equal(safeStagingReason('MODEL_CYCLE:private-key-abc'),'STAGING_MODEL_CYCLE_FAILED');
 assert.equal(safeStagingReason('STAGING_LEDGER_EXCEPTION'),'STAGING_LEDGER_EXCEPTION');
});
