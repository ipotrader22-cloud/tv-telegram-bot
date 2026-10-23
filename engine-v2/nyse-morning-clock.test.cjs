'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateMorningTrigger}=require('./nyse-morning-clock.cjs');
test('epoch NYSE 10 ET passes',()=>assert.equal(validateMorningTrigger({date:'2026-10-19',runAt:'2026-10-19T10:00:00-04:00'}).status,'PASS'));
test('NYSE weekend blocks',()=>assert.equal(validateMorningTrigger({date:'2026-10-24',runAt:'2026-10-24T10:00:00-04:00'}).reason,'NYSE_CLOSED'));
test('10:06 blocks',()=>assert.equal(validateMorningTrigger({date:'2026-10-19',runAt:'2026-10-19T10:06:00-04:00'}).reason,'OUTSIDE_1000_ET_WINDOW'));
test('wrong session date blocks',()=>assert.equal(validateMorningTrigger({date:'2026-10-19',runAt:'2026-10-20T10:00:00-04:00'}).reason,'SESSION_DATE_MISMATCH'));
