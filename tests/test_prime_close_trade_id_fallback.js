'use strict';

const assert = require('assert');
const Module = require('module');

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

const { getStandardBridgeClosePublicationState } = require('../app.js').__test;
Module._load = originalLoad;

function sheetNameFromRange(range) {
  return String(range || '')
    .split('!')[0]
    .replace(/^'|'$/g, '');
}

function createMockSheets(openRows) {
  const rows = {
    'Open Positions': [
      ['trade_id', 'open_time', 'symbol', 'side', 'status', 'entry', 'size', 'target', 'stop', 'last_price', 'unrealized_p_l', 'raw'],
      ...openRows,
    ],
    Trades: [['timestamp', 'symbol', 'side', 'event']],
    'Closed Trades': [['trade_id', 'open_time', 'close_time']],
    'Trade Metadata': [['Metadata ID', 'Trade ID', 'System']],
  };

  return {
    spreadsheets: {
      async get() {
        return {
          data: {
            sheets: Object.keys(rows).map((title, index) => ({
              properties: { title, sheetId: index + 1 },
            })),
          },
        };
      },
      values: {
        async get({ range }) {
          const sheetName = sheetNameFromRange(range);
          return { data: { values: (rows[sheetName] || []).map(row => [...row]) } };
        },
        async update({ range, requestBody }) {
          const sheetName = sheetNameFromRange(range);
          if (!rows[sheetName]) rows[sheetName] = [];
          if (String(range).includes('!A1:')) rows[sheetName][0] = [...requestBody.values[0]];
          return { data: {} };
        },
      },
      async batchUpdate() {
        return { data: {} };
      },
    },
  };
}

function legacyOpenRow() {
  return [
    'OKLO_LONG',
    '2026-08-27 11:45:20',
    'OKLO',
    'LONG',
    'open',
    42.84,
    700,
    43.38,
    41.12,
    '',
    '',
    JSON.stringify({
      source: 'IB_BRIDGE',
      event: 'ENTRY_FILL',
      strategy: 'SHREK_1_4',
      system_id: 'VIXALE_PRIME',
      symbol: 'OKLO',
      side: 'LONG',
      entry: 42.84,
      qty: 700,
      target: 43.38,
      stop: 41.12,
      // Deliberately no setup_id: this is the live legacy Prime ENTRY_FILL shape.
    }),
  ];
}

function primeCloseRow(overrides = {}) {
  return {
    trade_id: 'OKLO_LONG',
    setup_id: 'OKLO_LONG',
    symbol: 'OKLO',
    side: 'LONG',
    source: 'IB_BRIDGE',
    system_id: 'VIXALE_PRIME',
    raw: JSON.stringify({ bridge_delivery_id: 'TP:OKLO:5c6970a60002426211009112' }),
    ...overrides,
  };
}

async function run() {
  const sheets = createMockSheets([legacyOpenRow()]);
  const state = await getStandardBridgeClosePublicationState(sheets, primeCloseRow());
  assert.ok(state.open, 'OKLO durable Prime close must match its legacy Open row by OKLO_LONG');
  assert.strictEqual(state.open.row_number, 2);
  assert.strictEqual(state.open.row[0], 'OKLO_LONG');

  const mismatchedSetup = await getStandardBridgeClosePublicationState(sheets, primeCloseRow({
    setup_id: 'SOME_OTHER_SETUP',
  }));
  assert.strictEqual(mismatchedSetup.open, null, 'non-legacy setup_id must not fall back to trade_id');

  const edgeSetup = await getStandardBridgeClosePublicationState(sheets, primeCloseRow({
    setup_id: 'VIXALE_EDGE:OKLO:15:LONG:1787844600000',
    system_id: 'VIXALE_EDGE',
  }));
  assert.strictEqual(edgeSetup.open, null, 'VIXALE_EDGE must keep strict setup_id matching');

  const wrongSource = await getStandardBridgeClosePublicationState(sheets, primeCloseRow({
    source: 'TradingView',
  }));
  assert.strictEqual(wrongSource.open, null, 'non-broker callbacks must not receive the legacy fallback');

  console.log('OKLO Prime durable close trade-id fallback tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
