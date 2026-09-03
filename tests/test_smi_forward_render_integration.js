'use strict';

const assert = require('assert');
const Module = require('module');

process.env.BRIDGE_URL = 'http://mock-bridge.test';
process.env.BRIDGE_FORWARD_ENABLED = 'true';
process.env.BRIDGE_DRY_RUN = 'true';
process.env.MAX_BRIDGE_QTY = '1000';

function fakeExpress() {
  return {
    set() {},
    use() {},
    get() {},
    post() {},
    listen() { throw new Error('app.listen must not run in tests'); },
  };
}
fakeExpress.json = fakeExpress.urlencoded = fakeExpress.text = () => (_req, _res, next) => next?.();

const originalLoad = Module._load;
Module._load = function loadWithTestDoubles(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'googleapis') {
    return {
      google: {
        auth: { GoogleAuth: class GoogleAuth {} },
        sheets: () => ({}),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  parseJsonTradingViewAlert,
  isSmiForwardPayload,
  isSmiForwardRow,
  validateSmiForwardTransportContract,
  isSmiEntryFillBrokerCallback,
  hasConfirmedSmiEntryExecution,
  isSmiBrokerExitCallbackShape,
  isPersistentSmiBrokerExitCallback,
  bridgePayload,
  validateBridgePayload,
} = require('../app.js').__test;
Module._load = originalLoad;

function entryPayload(overrides = {}) {
  return {
    source: 'TradingView',
    payload_version: 1,
    schema_version: 2,
    system_id: 'VIXALE_SMI_FWD',
    strategy_id: 'SMI_HISTOGRAM_V0_4_FWD',
    strategy: 'SMI_HISTOGRAM_V0_4_FWD',
    research_version: '0.4-FWD',
    sec_type: 'STK',
    asset_class: 'STOCK',
    signal: 'BUY',
    event: 'SETUP',
    symbol: 'AAPL',
    timeframe: '60',
    side: 'LONG',
    signal_bar_time: 1788379200000,
    setup_id: 'SMI_HISTOGRAM_V0_4_FWD:AAPL:60:LONG:1788379200000',
    entry: 100,
    price: 100,
    target: 102,
    target_tif: 'GTC',
    entry_order_type: 'MARKET',
    qty: 30,
    qty_source: 'TV Strategy Properties',
    position_size_pct: 3,
    ...overrides,
  };
}

function run() {
  const entry = entryPayload();
  const entryRow = parseJsonTradingViewAlert(entry);

  assert.strictEqual(isSmiForwardPayload(entry), true);
  assert.strictEqual(isSmiForwardRow(entryRow), true);
  assert.deepStrictEqual(validateSmiForwardTransportContract(entry), { ok: true, reason: 'ok' });
  assert.strictEqual(entryRow.size, 30, 'Render preserves TradingView whole-share qty');

  const missingQty = entryPayload();
  delete missingQty.qty;
  const missingQtyRow = parseJsonTradingViewAlert(missingQty);
  assert.strictEqual(missingQtyRow.size, '', 'SMI must never fall back to BRIDGE_DEFAULT_QTY');
  assert.strictEqual(validateSmiForwardTransportContract(missingQty).ok, false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(bridgePayload(missingQty, missingQtyRow), 'qty'), false);

  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ position_size_pct: 4 })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ qty_source: 'Render BRIDGE_DEFAULT_QTY' })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ qty: 30.5 })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ entry_order_type: 'LIMIT' })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ target_tif: 'DAY' })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ target: 99 })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(entryPayload({ system_id: 'VIXALE_EDGE' })).ok, false);

  const bridgeEntry = bridgePayload(entry, entryRow);
  assert.strictEqual(bridgeEntry.qty, 30);
  assert.strictEqual(bridgeEntry.qty_source, 'TV Strategy Properties');
  assert.strictEqual(validateBridgePayload(bridgeEntry, entryRow).ok, true);

  const entryFill = entryPayload({
    source: 'IB_BRIDGE',
    event: 'ENTRY_FILL',
    entry_filled: true,
    ib_status: 'submitted',
    ib_entry_status: 'Filled',
    ib_entry_fill_price: 100,
    ib_entry_filled_qty: 30,
    entry_execution_id: 'EXEC:SMI-ENTRY-1',
    ib_order_id: 101,
    ib_target_order_id: 102,
  });
  const fillRow = parseJsonTradingViewAlert(entryFill);
  assert.strictEqual(isSmiEntryFillBrokerCallback(entryFill, fillRow), true);
  assert.strictEqual(hasConfirmedSmiEntryExecution(entryFill, fillRow), true);
  assert.strictEqual(hasConfirmedSmiEntryExecution({ ...entryFill, entry_execution_id: '' }, fillRow), false);
  assert.strictEqual(hasConfirmedSmiEntryExecution({ ...entryFill, ib_target_order_id: 0 }, fillRow), false);
  assert.strictEqual(hasConfirmedSmiEntryExecution({ ...entryFill, ib_entry_filled_qty: 29 }, fillRow), false);

  const close = entryPayload({
    source: 'TradingView',
    signal: 'EXIT_LONG',
    event: 'CLOSE_STOP',
    render_forwarded_at: '2026-09-02 16:00:00',
    render_safety: { bridge_forward_enabled: true },
    close_filled: true,
    ib_status: 'Filled',
    ib_close_status: 'Filled',
    ib_order_id: 201,
    exit_execution_id: 'EXEC:SMI-CLOSE-1',
    position_after_close: 0,
  });
  const closeRow = parseJsonTradingViewAlert(close);
  assert.strictEqual(closeRow.event, 'SL');
  assert.strictEqual(closeRow.raw_event, 'CLOSE_STOP');
  assert.strictEqual(isSmiBrokerExitCallbackShape(close, closeRow), true);
  assert.strictEqual(isPersistentSmiBrokerExitCallback(close, closeRow), true);
  assert.strictEqual(isPersistentSmiBrokerExitCallback({ ...close, position_after_close: 1 }, closeRow), false);
  assert.strictEqual(isPersistentSmiBrokerExitCallback({ ...close, exit_execution_id: '' }, closeRow), false);

  console.log('SMI Render integration tests passed');
}

run();
