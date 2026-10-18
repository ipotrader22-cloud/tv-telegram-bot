'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sessionEvidence,localSessionDate}=require('./nyse-session-adapter.cjs');
test('NYSE session permits Monday October 19 2026',()=>{const x=sessionEvidence('2026-10-19');assert.equal(x.isTradingDay,true);assert.equal(x.closeEt,'16:00')});
test('NYSE calendar blocks Sundays',()=>assert.equal(sessionEvidence('2026-10-18').isTradingDay,false));
test('unknown calendar year fails closed',()=>assert.throws(()=>sessionEvidence('2029-10-19'),/maintenance/));
test('DST session date correct in New York',()=>assert.equal(localSessionDate(new Date('2026-10-19T01:00:00Z')),'2026-10-18'));
