'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateSmioSignal } = require('../lib/smio-demo-contract');

const pine = fs.readFileSync(path.join(__dirname, '../uam/smio_demo/Pine/SMIO_RSI_Research_v0_1_UAM_Demo.pine'), 'utf8');
const escapeBlock = pine.split('f_escape(string x) =>')[1]?.split('f_num(float x) =>')[0] || '';
assert(escapeBlock, 'SMIO transport JSON escaper missing');
assert(!escapeBlock.includes('str.replace_all(v, "\\r"'), 'CR substitution can corrupt ordinary r in true');
assert(!escapeBlock.includes('str.replace_all(v, "\\t"'), 'tab substitution can corrupt ordinary t');
assert(pine.includes('str.tostring(allowLong)') && pine.includes('str.tostring(flattenRTH)'), 'Pine strategy identity changed unexpectedly');

const now = Date.now();
const barStart = now - 30 * 60 * 1000;
const barClose = now - 1000;
const config = 'PINE01:139:41:20:3:true:true:8:21:200:ATR:0.7:Auto:true';
const setup = 'SMIO_RSI_RESEARCH:' + config + ':NYSE:BE:30:SHORT:' + barStart;
const body = {
  source: 'TradingView', experimental_contract: 'SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013',
  system_id: 'TRADING_LAB_SMIO_RSI_PAPER', strategy_id: 'SMIO_RSI_RESEARCH',
  mode: 'PAPER', research_version: 'PINE_0.1', sec_type: 'STK', initial_capital: 1000000,
  paper_contract_version: 1, symbol: 'BE', tickerid: 'NYSE:BE', timeframe: '30',
  configuration_id: config, setup_id: setup,
  event_id: setup + ':SELL:' + barClose + ':RSI_ENTRY',
  side: 'SHORT', signal: 'SELL', event: 'SETUP', reason: 'RSI_ENTRY', qty: 448,
  qty_source: 'TV Strategy Properties', entry: 220.47, price: 220.47,
  entry_order_type: 'MARKET', session_timezone: 'America/New_York',
  signal_bar_time: barStart, signal_bar_close: barClose, target_mode: 'ATR',
  target: 217.61, target_price: 217.61,
};
assert(validateSmioSignal(body, now).ok, 'valid whole-share BE configuration should pass');
const broken = structuredClone(body);
broken.configuration_id = broken.configuration_id.replaceAll('true', 't\\rue');
assert.strictEqual(validateSmioSignal(broken, now).reason, 'SMIO identity mismatch');
for (const strategy of ['SHREK_1_4', 'VIXALE_PRIME']) {
  const { isSmioRsiPayload } = require('../lib/smio-rsi-gate');
  assert.strictEqual(isSmioRsiPayload({ strategy }), false);
}
console.log('SMIO Pine identity escaping and Shrek/Prime isolation: PASS');
