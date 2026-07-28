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
  const controls = { fail_trades_append: 0 };

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
        if (sheetName === 'Trades' && controls.fail_trades_append > 0) {
          controls.fail_trades_append--;
          throw new Error('mock Trades append failure');
        }
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
      async batchUpdate({ requestBody }) {
        for (const update of requestBody.data || []) {
          const { sheetName, startColumn, rowNumber } = parseRange(update.range);
          const target = rows[sheetName][rowNumber - 1];
          update.values[0].forEach((value, index) => {
            target[startColumn + index] = value;
          });
        }
        return { data: {} };
      },
    },
  };

  return { spreadsheets, rows, controls };
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

function countRowsBySetupId(rows, rawColumn, setupId) {
  return rows
    .slice(1)
    .filter(row => JSON.parse(row[rawColumn] || '{}').setup_id === setupId)
    .length;
}

async function run() {
  const sheets = createMockSheets();
  const telegram = [];
  const bridgeNetwork = [];
  const createLifecycleContext = ({
    sheetStore = sheets,
    telegramStore = telegram,
    bridgeStore = bridgeNetwork,
    telegramSender,
  } = {}) => {
    const dependencies = {
      sheets: sheetStore,
      sendTelegram: telegramSender || (async message => {
        telegramStore.push(message);
        return { ok: true };
      }),
      forwardToBridge: async (body, row) => {
        const decision = shouldForwardToBridge(body, row);
        if (!decision.ok) {
          return { forwarded: false, skipped: true, reason: decision.reason };
        }
        bridgeStore.push(row.event);
        return { forwarded: true };
      },
    };

    return async payload => {
      const row = parseJsonTradingViewAlert(payload);
      return processRecognizedTradingViewWebhookLifecycle(
        payload,
        row,
        JSON.stringify(payload),
        true,
        dependencies
      );
    };
  };
  let lifecycle = createLifecycleContext();

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

  const entryFill = edgePayload('ENTRY_FILL', filledId, {
    render_forwarded_at: '2026-07-28T10:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  });
  await lifecycle(entryFill);
  const duplicateFill = await lifecycle(entryFill);
  assert.strictEqual(sheets.rows.Pending.length, 1, 'ENTRY_FILL removes exact Pending');
  assert.strictEqual(
    sheets.rows['Open Positions'].filter(row => JSON.parse(row[11] || '{}').setup_id === filledId).length,
    1,
    'duplicate ENTRY_FILL creates no additional Open row'
  );
  assert.strictEqual(
    sheets.rows.Trades.filter(row => JSON.parse(row[10] || '{}').setup_id === filledId).length,
    1,
    'duplicate ENTRY_FILL appends no additional Trades FILL'
  );
  assert.strictEqual(
    telegram.filter(message => message.includes('Vixale Edge opened')).length,
    1,
    'duplicate ENTRY_FILL sends no additional Telegram OPEN'
  );
  assert.strictEqual(duplicateFill.finalRow.status, 'ignored_duplicate_entry_fill');
  assert.strictEqual(duplicateFill.finalRow.entry_fill_publication_state.publication_complete, true);
  assert.strictEqual(
    bridgeNetwork.filter(event => event === 'FILL').length,
    0,
    'ENTRY_FILL callbacks never forward to bridge'
  );

  lifecycle = createLifecycleContext();
  const restartDuplicate = await lifecycle(entryFill);
  assert.strictEqual(
    restartDuplicate.finalRow.status,
    'ignored_duplicate_entry_fill',
    'persistent Sheets state rejects duplicate after lifecycle context recreation'
  );
  assert.strictEqual(restartDuplicate.finalRow.entry_fill_publication_state.publication_complete, true);
  assert.strictEqual(sheets.rows.Pending.length, 1, 'restart duplicate leaves Pending removed');
  assert.strictEqual(sheets.rows['Open Positions'].length, 2, 'restart duplicate preserves one Open row');
  assert.strictEqual(sheets.rows.Trades.length, 2, 'restart duplicate preserves one Trades FILL');
  assert.strictEqual(
    telegram.filter(message => message.includes('Vixale Edge opened')).length,
    1,
    'restart duplicate sends no Telegram OPEN'
  );

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

  // A. Telegram failure recovery.
  const telegramFailureSheets = createMockSheets();
  const telegramFailureMessages = [];
  const telegramFailureBridge = [];
  let failNextOpenTelegram = true;
  const telegramFailureLifecycle = createLifecycleContext({
    sheetStore: telegramFailureSheets,
    telegramStore: telegramFailureMessages,
    bridgeStore: telegramFailureBridge,
    telegramSender: async message => {
      if (message.includes('Vixale Edge opened') && failNextOpenTelegram) {
        failNextOpenTelegram = false;
        return { ok: false, description: 'mock Telegram failure' };
      }
      telegramFailureMessages.push(message);
      return { ok: true };
    },
  });
  const telegramFailureId = 'VIXALE_EDGE:MSFT:60:LONG:1785270000000';
  const telegramFailurePending = edgePayload('PENDING_SETUP', telegramFailureId, {
    symbol: 'MSFT',
    flip_bar_time: 1785270000000,
  });
  const telegramFailureFill = edgePayload('ENTRY_FILL', telegramFailureId, {
    symbol: 'MSFT',
    flip_bar_time: 1785270000000,
    render_forwarded_at: '2026-07-28T11:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  });
  await telegramFailureLifecycle(telegramFailurePending);
  await assert.rejects(
    telegramFailureLifecycle(telegramFailureFill),
    error => error.retryable === true
  );
  assert.strictEqual(
    countRowsBySetupId(telegramFailureSheets.rows['Open Positions'], 11, telegramFailureId),
    1,
    'Telegram failure keeps the one successful Open row'
  );
  assert.strictEqual(
    countRowsBySetupId(telegramFailureSheets.rows.Trades, 10, telegramFailureId),
    1,
    'Telegram failure keeps the one successful Trades FILL'
  );
  const telegramRecovery = await telegramFailureLifecycle(telegramFailureFill);
  assert.strictEqual(telegramRecovery.finalRow.status, 'entry_fill_publication_complete');
  assert.strictEqual(
    countRowsBySetupId(telegramFailureSheets.rows['Open Positions'], 11, telegramFailureId),
    1,
    'Telegram retry does not duplicate Open'
  );
  assert.strictEqual(
    countRowsBySetupId(telegramFailureSheets.rows.Trades, 10, telegramFailureId),
    1,
    'Telegram retry does not duplicate Trades'
  );
  assert.strictEqual(
    telegramFailureMessages.filter(message => message.includes('Vixale Edge opened')).length,
    1,
    'Telegram retry publishes one successful OPEN'
  );
  assert.strictEqual(
    JSON.parse(telegramFailureSheets.rows['Open Positions'][1][11]).publication_complete,
    true
  );

  // B. Partial ledger recovery.
  const partialSheets = createMockSheets();
  const partialTelegram = [];
  const partialBridge = [];
  const partialLifecycle = createLifecycleContext({
    sheetStore: partialSheets,
    telegramStore: partialTelegram,
    bridgeStore: partialBridge,
  });
  const partialId = 'VIXALE_EDGE:NVDA:60:LONG:1785273600000';
  const partialPending = edgePayload('PENDING_SETUP', partialId, {
    symbol: 'NVDA',
    flip_bar_time: 1785273600000,
  });
  const partialFill = edgePayload('ENTRY_FILL', partialId, {
    symbol: 'NVDA',
    flip_bar_time: 1785273600000,
    render_forwarded_at: '2026-07-28T12:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  });
  await partialLifecycle(partialPending);
  partialSheets.controls.fail_trades_append = 1;
  await assert.rejects(partialLifecycle(partialFill), /mock Trades append failure/);
  assert.strictEqual(countRowsBySetupId(partialSheets.rows['Open Positions'], 11, partialId), 1);
  assert.strictEqual(countRowsBySetupId(partialSheets.rows.Trades, 10, partialId), 0);
  assert.strictEqual(
    partialTelegram.filter(message => message.includes('Vixale Edge opened')).length,
    0
  );
  const partialRecovery = await partialLifecycle(partialFill);
  assert.strictEqual(partialRecovery.finalRow.status, 'entry_fill_publication_complete');
  assert.strictEqual(countRowsBySetupId(partialSheets.rows['Open Positions'], 11, partialId), 1);
  assert.strictEqual(countRowsBySetupId(partialSheets.rows.Trades, 10, partialId), 1);
  assert.strictEqual(
    partialTelegram.filter(message => message.includes('Vixale Edge opened')).length,
    1
  );

  // C. Completed duplicate remains ignored after lifecycle-context recreation.
  const partialActivity = {
    open: partialSheets.rows['Open Positions'].length,
    trades: partialSheets.rows.Trades.length,
    telegram: partialTelegram.length,
    bridge: partialBridge.length,
  };
  const restartedPartialLifecycle = createLifecycleContext({
    sheetStore: partialSheets,
    telegramStore: partialTelegram,
    bridgeStore: partialBridge,
  });
  const completedDuplicate = await restartedPartialLifecycle(partialFill);
  assert.strictEqual(completedDuplicate.finalRow.status, 'ignored_duplicate_entry_fill');
  assert.deepStrictEqual({
    open: partialSheets.rows['Open Positions'].length,
    trades: partialSheets.rows.Trades.length,
    telegram: partialTelegram.length,
    bridge: partialBridge.length,
  }, partialActivity, 'completed duplicate creates no publication activity');

  // D. Concurrent callbacks share the same full publication promise.
  const concurrentSheets = createMockSheets();
  const concurrentTelegram = [];
  const concurrentBridge = [];
  let releaseTelegram;
  let signalTelegramStarted;
  const telegramStarted = new Promise(resolve => {
    signalTelegramStarted = resolve;
  });
  const telegramGate = new Promise(resolve => {
    releaseTelegram = resolve;
  });
  const concurrentLifecycle = createLifecycleContext({
    sheetStore: concurrentSheets,
    telegramStore: concurrentTelegram,
    bridgeStore: concurrentBridge,
    telegramSender: async message => {
      if (message.includes('Vixale Edge opened')) {
        signalTelegramStarted();
        await telegramGate;
      }
      concurrentTelegram.push(message);
      return { ok: true };
    },
  });
  const concurrentId = 'VIXALE_EDGE:AMD:60:LONG:1785277200000';
  const concurrentPending = edgePayload('PENDING_SETUP', concurrentId, {
    symbol: 'AMD',
    flip_bar_time: 1785277200000,
  });
  const concurrentFill = edgePayload('ENTRY_FILL', concurrentId, {
    symbol: 'AMD',
    flip_bar_time: 1785277200000,
    render_forwarded_at: '2026-07-28T13:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  });
  await concurrentLifecycle(concurrentPending);
  const firstConcurrent = concurrentLifecycle(concurrentFill);
  await telegramStarted;
  let secondSettled = false;
  const secondConcurrent = concurrentLifecycle(concurrentFill).then(result => {
    secondSettled = true;
    return result;
  });
  await Promise.resolve();
  assert.strictEqual(secondSettled, false, 'concurrent duplicate waits for active publication');
  assert.strictEqual(countRowsBySetupId(concurrentSheets.rows['Open Positions'], 11, concurrentId), 1);
  assert.strictEqual(countRowsBySetupId(concurrentSheets.rows.Trades, 10, concurrentId), 1);
  releaseTelegram();
  const [firstConcurrentResult, secondConcurrentResult] = await Promise.all([
    firstConcurrent,
    secondConcurrent,
  ]);
  assert.strictEqual(firstConcurrentResult.finalRow.status, 'entry_fill_publication_complete');
  assert.strictEqual(secondConcurrentResult.finalRow.status, 'entry_fill_publication_complete');
  assert.strictEqual(
    concurrentTelegram.filter(message => message.includes('Vixale Edge opened')).length,
    1
  );
  assert.strictEqual(
    concurrentBridge.filter(event => event === 'FILL').length,
    0
  );

  console.log('Vixale Edge app lifecycle integration: mocked Sheets, Telegram, and bridge checks passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
