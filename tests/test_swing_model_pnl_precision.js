'use strict';
const assert = require('node:assert/strict');
const { calculateModelPnl } = require('../lib/swing-leaders');
// Real November 6 publication: rounded returns used to lose 37 cents in
// summary metrics while individual trade rows and Equity History stayed exact.
const closed = [
  {ticker:'CVX',entry_price:'$231.77',exit_price:'$221.20',return_pct:'-4.56%',shares:999},
  {ticker:'XOM',entry_price:'$182.60',exit_price:'$172.46',return_pct:'-5.55%',shares:1},
];
assert.equal(calculateModelPnl(closed), -1011.37);
assert.equal(calculateModelPnl(closed.map(x=>({...x,return_pct:'0.00%'}))), -1011.37);
assert.equal(calculateModelPnl([{ticker:'SMALL',entry_price:'$100',current_price:'$100.004',return_pct:'0.00%'}]), 0.40);
assert.equal(calculateModelPnl([{ticker:'LOSS',entry_price:'$100',exit_price:'$0',return_pct:'-100.00%'}]), -10000);
assert.equal(calculateModelPnl([]), 0);
assert.throws(()=>calculateModelPnl([{ticker:'BAD',entry_price:'$0',exit_price:'$1',return_pct:'0.00%'}]), /Invalid model prices/);
assert.throws(()=>calculateModelPnl([{ticker:'BAD',entry_price:'$1',exit_price:'N/A',return_pct:'0.00%'}]), /Invalid currency/);
console.log('PASS fixed-$10K aggregate precision; rounded percentages and share counts ignored');
