'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dbName,validateMorningCommit,ddl}=require('./clean-ledger.cjs');
test('refuse production or arbitrary Postgres names',()=>{assert.throws(()=>dbName('postgres://x:y@localhost/production'));assert.equal(dbName('postgres://x:y@localhost/vixale_engine_v2_shadow_20261016'),'vixale_engine_v2_shadow_20261016')});
test('require full research before even empty portfolio run',()=>{const v=validateMorningCommit({date:'2026-10-19',events:[],positions:[],closed:[]});assert.equal(v.status,'BLOCKED');assert.equal(v.reason,'RESEARCH_NOT_CERTIFIED')});
test('schema has unique session and publication outbox disabled',()=>{assert.match(ddl.join(' '),/UNIQUE\(epoch,session_date\)/);assert.match(ddl.join(' '),/CHECK\(status='DISABLED'\)/)});

test('clean state table persists whole holdings and closes by date',()=>{const sql=ddl.join(' ');assert.match(sql,/clean_daily_state/);assert.match(sql,/active jsonb NOT NULL,closed jsonb NOT NULL/);assert.match(sql,/UNIQUE\(epoch,session_date\)/)});
test('missing ledger arrays cannot be committed as a valid run',()=>{const x=validateMorningCommit({date:'2026-10-19',researchBatch:{date:'2026-10-19'},events:[]});assert.equal(x.status,'BLOCKED')});
