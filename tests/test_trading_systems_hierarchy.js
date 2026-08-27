'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function renderTradingSystemsHtml()');
assert.ok(start >= 0, 'renderTradingSystemsHtml must exist');
const end = source.indexOf('\nfunction ', start + 32);
const block = source.slice(start, end >= 0 ? end : source.length);

function includes(value, message) {
  assert.ok(block.includes(value), message || `Expected Trading Systems markup to include: ${value}`);
}

includes('href="#day-trading"', 'Trading Systems menu must link to Day Trading');
includes('href="#swing-trading"', 'Trading Systems menu must link to Swing Trading');
includes('id="day-trading"', 'Day Trading section must exist');
includes('id="swing-trading"', 'Swing Trading section must exist');
includes('Day Trading Systems');
includes('Prime');
includes('Edge');
includes('Straddles');
includes('ATR / % based targets');
includes('Daily-close management');
includes('Evaluated on daily close');
includes('No Daily / Weekly split.');

assert.ok(!block.includes('href="#daily-systems"'), 'Swing Trading must not be split into a Daily navigation category');
assert.ok(!block.includes('href="#weekly-systems"'), 'Swing Trading must not be split into a Weekly navigation category');

// Existing market-level detail sections must remain available below the new hierarchy.
includes('id="stocks"');
includes('id="futures"');
includes('id="options"');

console.log('Trading Systems hierarchy tests passed.');
