'use strict';
const assert = require('node:assert/strict');
const {normalizeEngine2EquityRows,parseEquityHistory,EQUITY_HISTORY_SOURCE_FIELDS} = require('../lib/swing-leaders');
const rows = [
 [...EQUITY_HISTORY_SOURCE_FIELDS],
 ['2026-10-19','INCEPTION','-','-','-','$100,000.00','0'],
 ['2026-11-05','10:02 ET','($1,011.37)','-','($1,011.37)','$98,988.63','0'],
 [null,null,'-',null,'-','$100,000.00'],
];
const before=JSON.stringify(rows);
const history=parseEquityHistory(normalizeEngine2EquityRows(rows));
assert.equal(history.length,2);
assert.equal(history[1].total_model_pnl,-1011.37);
assert.equal(JSON.stringify(rows),before);
for(const change of [
 row=>row[0]='bad-date',
 row=>row[4]='not-money',
 row=>{row[0]='';row[1]='';}, // partial real row cannot disappear as a template
]) {
 const bad=structuredClone(rows);change(bad[2]);
 assert.throws(()=>parseEquityHistory(normalizeEngine2EquityRows(bad)));
}
const unexpectedTemplate=structuredClone(rows);
unexpectedTemplate[3][5]='$99,000.00';
assert.throws(()=>parseEquityHistory(normalizeEngine2EquityRows(unexpectedTemplate)));
console.log('Engine 2 accounting format and template guard PASS');
