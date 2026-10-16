'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditHistory}=require('./replay-audit.cjs');
const closed=[{ticker:'MU',entryDate:'2026-09-23',exitDate:'2026-10-12',entryPrice:1090.27,exitPrice:997.63,returnPct:-0.08496977812835349,includePublic:'YES',effectiveDate:'2026-10-12'}];
const expected=10000*closed[0].returnPct;
test('full precision recorded return reconciles',()=>{const out=auditHistory({closed,asOf:'2026-10-16',storedRealized:expected});assert.equal(out.status,'PASS');assert.equal(out.differences.length,0)});
test('rounded price recalculation is not accepted as same stored return',()=>{const fromRounded=10000*(997.63/1090.27-1);const out=auditHistory({closed,asOf:'2026-10-16',storedRealized:fromRounded-1});assert.equal(out.status,'BLOCKED');assert.equal(out.differences[0].gate,'REALIZED_NOT_RECONCILED')});
test('missing workbook comparison fails closed',()=>{const out=auditHistory({closed,asOf:'2026-10-16'});assert.equal(out.status,'BLOCKED')});
