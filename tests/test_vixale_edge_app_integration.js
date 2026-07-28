'use strict';

const assert = require('assert');
const Module = require('module');

process.env.BRIDGE_URL = 'http://mock-bridge.test';
process.env.BRIDGE_FORWARD_ENABLED = 'true';
process.env.BRIDGE_DRY_RUN = 'true';
process.env.MAX_BRIDGE_QTY = '100';

function fakeExpress() {
  return {
    set() {},
    use() {},
    get() {},
    post() {},
    listen() {
      throw new Error('app.listen must not run while app.js is required by tests');
    },
  };
}

fakeExpress.json = () => (_req, _res, next) => next?.();
fakeExpress.urlencoded = () => (_req, _res, next) => next?.();
fakeExpress.text = () => (_req, _res, next) => next?.();

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
  processRecognizedTradingViewWebhookLifecycle,
  shouldForwardToBridge,
} = require('../app.js').__test;
Module._load = originalLoad;

function columnIndex(letters) {
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function createMockSheets() {
  const rows = {
    Trades: [['Timestamp', 'Symbol', 'Side', 'Event']],
    Pending: [['Trade ID', 'Timestamp', 'Symbol', 'Side']],
    'Open Positions': [['Trade ID', 'Timestamp', 'Symbol', 'Side']],
    'Closed Trades': [['Trade ID', 'Open Time', 'Close Time']],
    Positions: [['Trade ID']],
  };
  const ids = Object.fromEntries(Object.keys(rows).map((name, index) => [name, index + 1]));
  const namesById = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));

  function parseRange(range) {
    const [sheetName, cells = 'A:Z'] = range.split('!');
    const match = cells.match(/^([A-Z]+)(\d+)?/);
    return {
      sheetName,
      startColumn: columnIndex(match?.[1] || 'A'),
      rowNumber: match?.[2] ? Number(match[2]) : null,
    };
  }

  const spreadsheets = {
    async get() {
      return {
        data: {
          sheets: Object.entries(ids).map(([title, sheetId]) => ({
            properties: { title, sheetId },
          })),
        },
      };
    },
    async batchUpdate({ requestBody }) {
      for (const request of requestBody.requests || []) {
        const range = request.deleteDimension?.range;
        if (!range) continue;
        rows[namesById[range.sheetId]].splice(range.startIndex, range.endIndex - range.startIndex);
      }
      return { data: {} };
    },
    values: {
      async get({ range }) {
        const { sheetName } = parseRange(range);
        return { data: { values: rows[sheetName].map(row => [...row]) } };
      },
      async append({ range, requestBody }) {
        const { sheetName } = parseRange(range);
        for (const row of requestBody.values) rows[sheetName].push([...row]);
        const rowNumber = rows[sheetName].length;
        return { data: { updates: { updatedRange: `${sheetName}!A${rowNumber}:Z${rowNumber}` } } };
      },
      async update({ range, requestBody }) {
        const { sheetName, startColumn, rowNumber } = parseRange(range);
        while (rows[sheetName].length < rowNumber) rows[sheetName].push([]);
        const target = rows[sheetName][rowNumber - 1];
        requestBody.values[0].forEach((value, index) => {
          target[startColumn + index] = value;
        });
        return { data: {} };
      },
      async batchUpdate() {
        return { data: {} };
      },
    },
  };

  return { spreadsheets, rows };
}

function edgePayload(event, setupId, overrides = {}) {
  return {
    source: 'TradingView',
    payload_version: 2,
    system_id: 'VIXALE_EDGE',
    setup_id: setupId,
    alert_instance_id: 'AAPL_60_VIXALE_EDGE',
    strategy: 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1',
    variant: 'FIONA_LIMIT_PULLBACK_ATR_TARGET',
    event,
    symbol: 'AAPL',
    side: 'LONG',
    entry: 123.45,
    planned_limit_entry: 123.45,
    target: 127.8,
    stop: 121.2,
    qty: 10,
    timeframe: '60',
    flip_bar_time: 1785254400000,
    target_tif: 'GTC',
    eod_policy: 'NO_EOD_CLOSE',
    ...overrides,
  };
}

async function run() {
  const sheets = createMockSheets();
  const telegram = [];
  const bridgeNetwork = [];
  const dependencies = {
    sheets,
    sendTelegram: async message => {
      telegram.push(message);
      return { ok: true };
    },
    forwardToBridge: async (body, row) => {
      const decision = shouldForwardToBridge(body, row);
      if (!decision.ok) {
        return { forwarded: false, skipped: true, reason: decision.reason };
      }
      bridgeNetwork.push(row.event);
      return { forwarded: true };
    },
  };
  const lifecycle = async payload => {
    const row = parseJsonTradingViewAlert(payload);
    return processRecognizedTradingViewWebhookLifecycle(
      payload,
      row,
      JSON.stringify(payload),
      true,
      dependencies
    );
  };

  const filledId = 'VIXALE_EDGE:AAPL:60:LONG:1785254400000';
  const pending = edgePayload('PENDING_SETUP', filledId);
  await lifecycle(pending);
  await lifecycle(pending);

  assert.strictEqual(sheets.rows.Pending.length, 2, 'PENDING_SETUP inserts one row');
  assert.strictEqual(sheets.rows.Pending[1][0], filledId, 'Pending is keyed by setup_id');
  assert.strictEqual(telegram.length, 1, 'duplicate PENDING_SETUP sends no second Telegram');
  assert.deepStrictEqual(bridgeNetwork, [], 'PENDING_SETUP never forwards to bridge');

  await lifecycle(edgePayload('SETUP', filledId));
  assert.strictEqual(sheets.rows.Pending.length, 2, 'SETUP preserves Pending before broker fill');
  assert.deepStrictEqual(bridgeNetwork, ['SETUP'], 'SETUP remains execution-first');

  await lifecycle(edgePayload('ENTRY_FILL', filledId, {
    render_forwarded_at: '2026-07-28T10:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  assert.strictEqual(sheets.rows.Pending.length, 1, 'ENTRY_FILL removes exact Pending');
  assert.strictEqual(sheets.rows['Open Positions'].length, 2, 'ENTRY_FILL creates one Open row');
  assert.strictEqual(sheets.rows['Open Positions'][1][0], 'AAPL_LONG');

  const canceledId = 'VIXALE_EDGE:AAPL:60:LONG:1785261600000';
  await lifecycle(edgePayload('PENDING_SETUP', canceledId, { flip_bar_time: 1785261600000 }));
  const cancelPayload = edgePayload('CANCEL', canceledId, {
    cancel_scope: 'PENDING_ONLY',
    reason: 'UNFILLED_BY_MARKET_CLOSE',
    flip_bar_time: 1785261600000,
  });
  const parsedCancel = parseJsonTradingViewAlert(cancelPayload);
  await lifecycle(cancelPayload);

  assert.strictEqual(
    sheets.rows.Pending.some(row => row[0] === canceledId),
    false,
    'PENDING_ONLY CANCEL removes exact setup_id'
  );
  assert.strictEqual(sheets.rows.Trades.length, 2, 'CANCEL creates no Trades row');
  assert.strictEqual(sheets.rows['Open Positions'].length, 2, 'CANCEL creates no Open row');
  assert.strictEqual(sheets.rows['Closed Trades'].length, 1, 'CANCEL creates no Closed row');
  assert.deepStrictEqual(bridgeNetwork, ['SETUP'], 'PENDING_ONLY CANCEL never forwards to bridge');

  assert.strictEqual(parsedCancel.planned_limit_entry, 123.45);
  assert.strictEqual(parsedCancel.target, 127.8);
  assert.strictEqual(parsedCancel.stop, 121.2);
  assert.strictEqual(parsedCancel.timeframe, '60');
  assert.strictEqual(parsedCancel.flip_bar_time, 1785261600000);
  assert.strictEqual(parsedCancel.setup_id, canceledId);

  console.log('Vixale Edge app lifecycle integration: mocked Sheets, Telegram, and bridge checks passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
