'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('research schedule uses distinguishable UTC/DST cron entries',()=>{
 const s=read('.github/workflows/swing-daily-research-inputs.yml');
 assert.ok(s.includes('cron: "50 13 * * 1-5"'));assert.ok(s.includes('cron: "50 14 * * 1-5"'));
 assert.ok(s.includes('SCHEDULED_CRON:'));
 assert.ok(s.includes('Due 09:50 ET research collection was delivered late'));
 assert.match(s,/exit 1[\s\S]*collect=false/);
});
test('publication gate rejects delayed expected cron without falsely claiming success',()=>{
 const s=read('.github/workflows/swing-morning-publication-verification.yml');
 assert.ok(s.includes('cron: "11,18 14 * * 1-5"'));
 assert.ok(s.includes('cron: "11,18 15 * * 1-5"'));
 assert.ok(s.includes('SCHEDULED_CRON:'));
 assert.ok(s.includes('no verification occurred'));
 assert.ok(s.includes('exit 1'));
});
