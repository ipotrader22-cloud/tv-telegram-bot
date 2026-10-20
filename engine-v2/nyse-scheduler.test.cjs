'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nextMorning}=require('./nyse-scheduler.cjs');
test('fall DST converts NYSE 10 to 15 UTC',()=>assert.equal(nextMorning(new Date('2026-10-30T15:00:00Z')).at,'2026-11-02T15:00:00.000Z'));
test('spring DST converts NYSE 10 to 14 UTC',()=>assert.equal(nextMorning(new Date('2027-03-12T16:00:00Z')).at,'2027-03-15T14:00:00.000Z'));
test('Thanksgiving holiday skipped',()=>assert.equal(nextMorning(new Date('2026-11-25T16:00:00Z')).date,'2026-11-27'));
test('same day before NYSE 10 ET returns today',()=>assert.equal(nextMorning(new Date('2026-10-19T13:00:00Z')).date,'2026-10-19'));
