'use strict';
const assert = require('assert');
const Module = require('module');
const { isSmioRsiPayload } = require('../lib/smio-rsi-gate');
const originalLoad = Module._load;
function express() { return { set() {}, use() {}, get() {}, post() {} }; }
express.json = express.urlencoded = express.text = () => () => {};
Module._load = function(request, ...args) {
  if (request === 'express') return express;
  if (request === 'googleapis') return { google: {
    auth: { GoogleAuth: class {} }, sheets: () => ({})
  } };
  return originalLoad.call(this, request, ...args);
};
const api = require('../app.js').__test;
Module._load = originalLoad;

(async () => {
  for (const key of ['system_id', 'strategy_id', 'strategy', 'setup_id']) {
    for (const event of ['SETUP', 'CLOSE_POSITION', 'ENTRY_FILL', 'TP', 'EXTERNAL_CLOSE']) {
      const payload = { [key]: 'smio_rsi_research', source: 'IB_BRIDGE',
        event, symbol: 'APA', side: 'LONG', qty: 10,
        strategy: 'SHREK_1_4', ...{ [key]: 'smio_rsi_research' } };
      assert(isSmioRsiPayload(payload));
      for (const body of [payload, JSON.stringify(payload), Buffer.from(JSON.stringify(payload))]) {
        let code, response;
        const res = { status(value) { code = value; return this; }, send(value) { response = value; } };
        await api.handleTradingViewWebhookWithDependencies({ body }, res, {
          spoolWebhookInboxItem() { throw Error('must not spool research'); },
          scheduleWebhookInboxWork() { throw Error('must not schedule research'); }
        });
        assert.strictEqual(code, 422);
        assert.strictEqual(response, 'SMIO_RSI_RESEARCH_FREEZE_AND_LIVE_SIZING_REQUIRED');
      }
      await api.processRecognizedTradingViewWebhookLifecycle(payload, { event: 'SETUP' }, '', true, {
        processLedger() { throw Error('must not publish research'); },
        forwardToBridge() { throw Error('must not forward research'); }
      });
    }
  }
  for (const strategy of ['SHREK_1_4', 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1', 'SMI_HISTOGRAM_V0_4_FWD']) {
    assert.strictEqual(isSmioRsiPayload({ strategy }), false);
  }
  // Old persisted payload masquerades as Edge with a stale setup. It must not
  // reach stale-entry cleanup and remove that other strategy's Pending row.
  const item = { delivery_id: 'research-replay', row_number: 2, status: 'RETRY',
    raw_json: JSON.stringify({ strategy_id: 'SMIO_RSI_RESEARCH',
      system_id: 'VIXALE_EDGE', event: 'SETUP', symbol: 'APA', side: 'LONG',
      setup_id: 'VIXALE_EDGE:APA:45:LONG:1', signal_bar_close: 1 }) };
  let updates = 0;
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: 'Webhook Inbox', sheetId: 1 } }] } }),
    values: {
      get: async ({ range }) => {
        assert.strictEqual(range, 'Webhook Inbox!A:M');
        return { data: { values: [[]] } };
      },
      update: async ({ range }) => {
        assert.strictEqual(range, "'Webhook Inbox'!A2:M2"); updates++;
        return { data: {} };
      }
    }
  } };
  const result = await api.processWebhookInboxItem(item, { sheets });
  assert.strictEqual(result.status, 'COMPLETE');
  assert.strictEqual(result.last_error, 'SMIO_RSI_RESEARCH_FREEZE_AND_LIVE_SIZING_REQUIRED');
  assert.strictEqual(updates, 2);
  // A repeat after completion cannot call Sheets or mutate any trade state.
  assert.strictEqual(await api.processWebhookInboxItem(result, {}), result);
  console.log('SMIO ingress / replay / callback gate: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
