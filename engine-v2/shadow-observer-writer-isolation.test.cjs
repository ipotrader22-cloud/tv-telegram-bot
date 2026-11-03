'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
test('shadow observer cannot compete with staging cron for send/disabled-email journal state',()=>{
 const src=fs.readFileSync(require.resolve('./shadow-health.cjs'),'utf8');
 assert.doesNotMatch(src,/stagingWorker\.tick\s*\(/,'observer must never call writer');
 assert.match(src,/createMorningDbAuditMonitor/,'retains private read-only journal audit');
 assert.match(src,/stagingWorker\.status\(\)/,'retains read-only service diagnostics');
});
