'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseV2Universe}=require('./research-universe.cjs');
test('separate declared universe adds benchmarks and excludes legacy holdings',()=>{
 const x=parseV2Universe('NVDA, AMD, MU');
 assert.deepEqual(x.candidates,['NVDA','AMD','MU']);assert.equal(x.legacyPortfolioUsed,false);
 assert.equal(x.symbols.includes('SPY'),true);
});
test('no universe fails closed, not legacy fallback',()=>assert.throws(()=>parseV2Universe(''),/NOT_CONFIGURED/));
test('duplicate, invalid and excessive candidates blocked',()=>{
 assert.throws(()=>parseV2Universe('AMD,AMD'),/DUPLICATED/);
 assert.throws(()=>parseV2Universe('AMD,$NO'),/INVALID/);
 assert.throws(()=>parseV2Universe(Array(41).fill(0).map((_,i)=>'S'+i).join(',')),/OUT_OF_BOUNDS/);
});
