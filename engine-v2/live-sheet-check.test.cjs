'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fromRanges,compareImported}=require('./live-sheet-check.cjs');
const values=[
 {values:[['2026-10-16','10:08 ET','NVDA','NASDAQ','2026-09-28',231.95,43,9973.85,216.35,9303.05,-670.8,-0.067255874111,76,'STOP LOSS','','','YES','2026-10-16']]},
 {values:[['2026-10-16','10:08 ET',-672.55874111,-313.838796453,-986.397537563,99013.602462437,1]]},
 {values:[['2026-10-08','NASDAQ','PLTR',85,'Active Portfolio',200.74,49,9836.26,186.03,9115.47,-720.79,-0.07328,0.1,'2026-10-13']]}
];
test('parses fixed canonical ranges without privileged API',()=>{const p=fromRanges(values);assert.equal(p.active[0].ticker,'PLTR');assert.equal(p.closed[0].includePublic,'YES');assert.equal(p.equity.length,1)});
test('rejects incorrect full-precision live accounting',()=>{const p=fromRanges(values);p.equity[0].realized+=1;assert.throws(()=>compareImported(p,{asOf:'2026-10-15',closed:[]}),/reconciliation/)});
test('detects changed Q controls and fresh snapshot',()=>{const p=fromRanges(values);p.equity[0].realized=10000*p.closed[0].returnPct;const r=compareImported(p,{asOf:'2026-10-15',closed:[{...p.closed[0],includePublic:'NO'}]});assert.equal(r.updated,true);assert.equal(r.closedChanged,1)});
