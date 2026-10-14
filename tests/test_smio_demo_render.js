'use strict';
const assert = require('assert');
const Module = require('module');
const { validateSmioSignal, validSmioCallback } = require('../lib/smio-demo-contract');
process.env.BRIDGE_URL = 'http://mock-bridge.test';
process.env.BRIDGE_FORWARD_ENABLED = 'true';
process.env.BRIDGE_DRY_RUN = 'false';
process.env.MAX_BRIDGE_QTY = '10000';
process.env.QUOTE_BRIDGE_KEY = 'fixture-key';
process.env.SHEET_ID = 'fixture';
function express() { return { set() {}, use() {}, get() {}, post() {} }; }
express.json = express.urlencoded = express.text = () => () => {};
const load = Module._load;
Module._load = function(request, ...args) {
  if (request === 'express') return express;
  if (request === 'googleapis') return { google: { auth: { GoogleAuth: class {} }, sheets: () => ({}) } };
  return load.call(this, request, ...args);
};
const api = require('../app.js').__test;
const { createMockSheets } = require('./mock_sheets');
Module._load = load;

function payload(side = 'LONG', mode = 'ATR') {
  const end = Date.now() - 100, start = end - 45 * 60000;
  const config = `PINE01:20:5:5:2:true:true:8:21:200:${mode === 'RSI_80_20' ? 'RSI 80/20' : mode === 'FirstOfEither' ? 'First of either' : 'ATR'}:1:Stocks RTH:true`;
  const setup = `SMIO_RSI_RESEARCH:${config}:NASDAQ:APA:45:${side}:${start}`;
  const signal = side === 'LONG' ? 'BUY' : 'SELL';
  const target = mode === 'RSI_80_20' ? null : side === 'LONG' ? 110 : 90;
  return { source: 'TradingView', system_id: 'TRADING_LAB_SMIO_RSI_PAPER', strategy_id: 'SMIO_RSI_RESEARCH',
    experimental_contract: 'SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013',
    mode: 'PAPER', paper_contract_version: 1, research_version: 'PINE_0.1', sec_type: 'STK',
    symbol: 'APA', tickerid: 'NASDAQ:APA', timeframe: '45', configuration_id: config, setup_id: setup,
    event_id: `${setup}:${signal}:${end}:RSI_ENTRY`, signal, event: 'SETUP', side, reason: 'RSI_ENTRY',
    signal_bar_time: start, signal_bar_close: end, qty: 10, qty_source: 'TV Strategy Properties', initial_capital: 1000000,
    entry: 100, price: 100, entry_order_type: 'MARKET', target_mode: mode, target, target_price: target,
    session_timezone: 'America/New_York' };
}

(async () => {
  for (const side of ['LONG', 'SHORT']) for (const mode of ['ATR', 'RSI_80_20', 'FirstOfEither']) {
    const p = payload(side, mode);
    assert(validateSmioSignal(p).ok);
    const row = api.parseJsonTradingViewAlert(p);
    assert.strictEqual(row.trade_id, p.setup_id);
    assert(api.shouldForwardToBridge(p, row).ok);
    assert(api.validateBridgePayload(api.bridgePayload(p, row), row).ok);
    let forwarded = 0;
    await api.processRecognizedTradingViewWebhookLifecycle(p, row, '', true, {
      processLedger() { throw Error('unfilled signal cannot publish'); },
      sendTelegram() { throw Error('unfilled signal cannot publish'); },
      async forwardToBridge(d) { assert.strictEqual(d.qty, 10); forwarded++; return { forwarded: true }; }
    });
    assert.strictEqual(forwarded, 1);
    const close = { ...p, signal: 'CLOSE', event: 'CLOSE_POSITION', reason: 'RSI_PROFIT',
      event_id: `${p.setup_id}:CLOSE:${p.signal_bar_close}:RSI_PROFIT` };
    assert(validateSmioSignal(close).ok);
    const closeRow = api.parseJsonTradingViewAlert(close);
    assert(api.shouldForwardToBridge(close, closeRow).ok);
    await api.processRecognizedTradingViewWebhookLifecycle(close, closeRow, '', true, {
      processLedger() { throw Error('close intent cannot publish'); },
      async forwardToBridge() { forwarded++; return { forwarded: true }; }
    });
    assert.strictEqual(forwarded, 2);
    for (const qty of [null, 0, -1, 1.5, true]) assert(!validateSmioSignal({ ...p, qty }).ok);
    assert(!validateSmioSignal({ ...p, mode: 'LIVE' }).ok);
    assert(!validateSmioSignal({ ...p, strategy: 'SHREK_1_4' }).ok);
    assert(!validateSmioSignal({ ...p, timeframe: '30' }).ok);
    assert(!validateSmioSignal(p, p.signal_bar_close + 90001).ok);
    const callback = { ...p, source: 'IB_BRIDGE', event: 'ENTRY_FILL', price: 100, entry: 100,
      entry_filled: true, ib_entry_status: 'Filled', ib_entry_fill_price: 100, ib_entry_filled_qty: 10,
      ib_order_id: 101, ib_order_ref: 'SMIOE_exact', entry_exec_ids: ['broker-entry'],
      ib_target_order_id: 102, ib_target_order_ref: 'SMIOT_exact' };
    assert(validSmioCallback(callback));
    assert(!validSmioCallback({ ...callback, source: 'TradingView' }));
    assert(!api.shouldForwardToBridge(callback, api.parseJsonTradingViewAlert(callback)).ok);
    const exit = { ...p, source: 'IB_BRIDGE', event: 'TP', price: 106.5, qty: 10,
      broker_confirmed_flat: true, position_after_close: 0, close_filled: true, ib_close_status: 'Filled',
      ib_close_filled_qty: 10, ib_close_fill_price: 106.5, reconciliation_id: 'exact', exit_execution_id: 'IB_BRIDGE:exact',
      ib_order_id: 103, ib_order_ref: 'SMIOC_exact', execution_components: {
        target: { qty: 3, price: 110 }, close: { qty: 7, price: 105 }
      } };
    assert(validSmioCallback(exit));
    assert(!validSmioCallback({ ...exit, position_after_close: 1 }));
    assert(!validSmioCallback({ ...exit, price: 110 }));
    const denied = { status(n) { this.code=n; return this; }, send(s) { this.text=s; return this; } };
    await api.handleTradingViewWebhookWithDependencies({body:callback,headers:{},query:{}},denied,{
      processLedger(){throw Error('unauthenticated callback reached ledger');}
    });
    assert.strictEqual(denied.code,401);
    const sheets = createMockSheets();
    let messages = [];
    const deps = {sheets,getSheetsClient:async()=>sheets,
      sendTelegram:async message=>{messages.push(message); return {ok:true};},
      forwardToBridge:async(body,row)=>{assert(!api.shouldForwardToBridge(body,row).ok);return {forwarded:false,skipped:true};}};
    for(let attempt=0;attempt<2;attempt++) {
      const response={status(n){this.code=n;return this;},send(s){this.text=s;return this;}};
      await api.handleTradingViewWebhookWithDependencies({body:callback,headers:{'x-vixale-quote-key':'fixture-key'},query:{}},response,deps);
      assert.strictEqual(response.code,200);
    }
    assert.strictEqual(sheets.rows['Open Positions'].length,2,'exactly one broker Open');
    assert.strictEqual(messages.length,1,'one OPEN across duplicate callbacks');
    assert(messages[0].includes('SMIO_RSI Demo'));
    for(let attempt=0;attempt<2;attempt++) {
      const response={status(n){this.code=n;return this;},send(s){this.text=s;return this;}};
      await api.handleTradingViewWebhookWithDependencies({body:{...exit,bridge_delivery_id:'SMIO:exit:fixture'},headers:{'x-vixale-quote-key':'fixture-key'},query:{}},response,deps);
      assert.strictEqual(response.code,200);
    }
    assert.strictEqual(sheets.rows['Open Positions'].length,1);
    assert.strictEqual(sheets.rows['Closed Trades'].length,2,'one broker Closed');
    assert.strictEqual(messages.length,2,'one CLOSE across duplicate callbacks');
  }
  console.log('SMIO demo Render transport / execution-first / callback contract: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
