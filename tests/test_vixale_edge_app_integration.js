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
  formatTelegramMessage,
  processRecognizedTradingViewWebhookLifecycle,
  handleTradingViewWebhookWithDependencies,
  shouldForwardToBridge,
  publicExitLabel,
  closedTradeExitDisplay,
  displayTradeId,
  parsePendingRow,
  parseOpenPositionRow,
  buildWorkingExitOrders,
  renderDashboardHtml,
  webhookInboundDeliveryId,
  upsertWebhookInboxItem,
  processWebhookInboxItem,
  processWebhookInboxDueItems,
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
    'Trade Metadata': [['Metadata ID', 'Trade ID', 'System']],
    'Webhook Inbox': [['Delivery ID', 'Received At', 'Event']],
    Positions: [['Trade ID']],
  };
  const ids = Object.fromEntries(Object.keys(rows).map((name, index) => [name, index + 1]));
  const namesById = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
  const controls = {
    fail_trades_append: 0,
    fail_closed_append: 0,
    fail_pending_write: 0,
    fail_webhook_complete_update: 0,
  };

  function parseRange(range) {
    const [rawSheetName, cells = 'A:Z'] = range.split('!');
    const sheetName = rawSheetName.replace(/^'|'$/g, '');
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
        if (sheetName === 'Closed Trades' && controls.fail_closed_append > 0) {
          controls.fail_closed_append--;
          throw new Error('mock Closed Trades append failure');
        }
        for (const row of requestBody.values) rows[sheetName].push([...row]);
        const rowNumber = rows[sheetName].length;
        return { data: { updates: { updatedRange: `${sheetName}!A${rowNumber}:Z${rowNumber}` } } };
      },
      async update({ range, requestBody }) {
        const { sheetName, startColumn, rowNumber } = parseRange(range);
        if (sheetName === 'Trades' && controls.fail_trades_append > 0) {
          controls.fail_trades_append--;
          throw new Error('mock Trades append failure');
        }
        if (sheetName === 'Closed Trades' && controls.fail_closed_append > 0) {
          controls.fail_closed_append--;
          throw new Error('mock Closed Trades append failure');
        }
        if (sheetName === 'Pending' && controls.fail_pending_write > 0) {
          controls.fail_pending_write--;
          throw new Error('mock Pending write failure');
        }
        if (
          sheetName === 'Webhook Inbox' &&
          controls.fail_webhook_complete_update > 0 &&
          String(requestBody.values?.[0]?.[7] || '').toUpperCase() === 'COMPLETE'
        ) {
          controls.fail_webhook_complete_update--;
          throw new Error('mock Webhook Inbox COMPLETE update failure');
        }
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

function countRowsByReconciliation(rows, rawColumn, reconciliationId, event) {
  const normalizedEvent = event === 'CLOSE_STOP' ? 'CLOSE_STOP' : event;
  return rows
    .slice(1)
    .filter(row => {
      const raw = JSON.parse(row[rawColumn] || '{}');
      return raw.reconciliation_id === reconciliationId &&
        String(raw.event || '').toUpperCase() === normalizedEvent;
    })
    .length;
}

function countMetadataRowsByReconciliation(rows, reconciliationId, event) {
  const normalizedEvent = event === 'CLOSE_STOP' ? 'SL' : event;
  return rows.slice(1).filter(row =>
    String(row[16] || '').trim() === reconciliationId &&
    String(row[7] || '').trim().toUpperCase() === normalizedEvent
  ).length;
}

function countRowsBySetupEvent(rows, rawColumn, setupId, event) {
  const normalizedEvent = String(event || '').toUpperCase();
  return rows
    .slice(1)
    .filter(row => {
      const raw = JSON.parse(row[rawColumn] || '{}');
      return raw.setup_id === setupId &&
        String(raw.event || '').toUpperCase() === normalizedEvent;
    })
    .length;
}

function createMockResponse() {
  return {
    sent: false,
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.sent = true;
      this.body = body;
      return this;
    },
  };
}

async function run() {
  const edgeSetupId = 'VIXALE_EDGE:TLT:15:SHORT:1786368600000';
  const edgeRaw = JSON.stringify({
    system_id: 'VIXALE_EDGE',
    setup_id: edgeSetupId,
    strategy: 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1',
    variant: 'FIONA_LIMIT_PULLBACK_ATR_TARGET',
  });
  const edgePending = parsePendingRow([
    edgeSetupId, '2026-08-10 10:00:00', 'TLT', 'SHORT', 'pending',
    88.5, 10, 87, 89.5, edgeRaw,
  ]);
  const edgeOpen = parseOpenPositionRow([
    edgeSetupId, '2026-08-10 10:05:00', 'TLT', 'SHORT', 'open',
    88.5, 10, 87, 89.5, '', '', edgeRaw,
  ]);
  const primeOpen = parseOpenPositionRow([
    'RTX_LONG', '2026-08-10 10:10:00', 'RTX', 'LONG', 'open',
    150, 5, 152, 0, '', '', JSON.stringify({ strategy: 'SHREK_1_4' }),
  ]);
  const targetOrders = buildWorkingExitOrders([edgeOpen, primeOpen]);

  assert.strictEqual(edgePending.trade_id, edgeSetupId, 'Edge Pending retains canonical setup identity');
  assert.strictEqual(JSON.parse(edgePending.raw).setup_id, edgeSetupId, 'Edge raw setup_id remains unchanged');
  assert.strictEqual(displayTradeId(edgePending), 'TLT_SHORT');
  assert.strictEqual(targetOrders[0].trade_id, edgeSetupId, 'Edge target retains canonical setup identity');
  assert.strictEqual(displayTradeId(targetOrders[0]), 'TLT_SHORT');
  assert.strictEqual(displayTradeId(targetOrders[1]), 'RTX_LONG');

  const displayHtml = renderDashboardHtml({
    summary: {},
    open_positions: [edgeOpen, primeOpen],
    working_orders: [edgePending, ...targetOrders],
    recent_closed_trades: [{
      trade_id: 'CSCO_LONG', system: 'Vixale Edge', symbol: 'CSCO', side: 'LONG',
      open_time: '', close_time: '', entry: 1, exit: 2, size: 1, result: 1, event: 'TP',
    }],
  });
  assert.ok(displayHtml.includes('TLT_SHORT'), 'dashboard displays short Edge Trade ID');
  assert.ok(displayHtml.includes('RTX_LONG'), 'dashboard displays short Prime Trade ID');
  assert.ok(displayHtml.includes('CSCO_LONG'), 'dashboard displays short closed Trade ID');
  assert.ok(!displayHtml.includes(edgeSetupId), 'dashboard never renders canonical Edge setup_id');
  const displayHtmlRu = renderDashboardHtml({
    summary: {},
    open_positions: [edgeOpen],
    working_orders: [edgePending, targetOrders[0]],
    recent_closed_trades: [],
  }, 'ru');
  assert.ok(displayHtmlRu.includes('TLT_SHORT'), 'Russian dashboard uses the same short Trade ID');
  assert.ok(!displayHtmlRu.includes(edgeSetupId), 'Russian dashboard never renders canonical Edge setup_id');

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
    lifecycle.dependencies = dependencies;
    return lifecycle;
  };

  const pendingShortMessage = formatTelegramMessage(
    parseJsonTradingViewAlert(edgePayload(
      'PENDING_SETUP',
      'VIXALE_EDGE:SBUX:15:SHORT:1785250800000',
      { symbol: 'SBUX', side: 'SHORT', timeframe: '15', stop: 103.55 }
    )),
    ''
  );
  const pendingLongMessage = formatTelegramMessage(
    parseJsonTradingViewAlert(edgePayload(
      'PENDING_SETUP',
      'VIXALE_EDGE:AAPL:60:LONG:1785254400000',
      { side: 'LONG', stop: 121.2 }
    )),
    ''
  );
  const setupShortMessage = formatTelegramMessage(
    parseJsonTradingViewAlert(edgePayload(
      'SETUP',
      'VIXALE_EDGE:SBUX:15:SHORT:1785250800000',
      { symbol: 'SBUX', side: 'SHORT', timeframe: '15', stop: 103.55 }
    )),
    ''
  );
  const fillLongMessage = formatTelegramMessage(
    parseJsonTradingViewAlert(edgePayload(
      'ENTRY_FILL',
      'VIXALE_EDGE:AAPL:60:LONG:1785254400000',
      { side: 'LONG', stop: 121.2 }
    )),
    ''
  );

  assert.match(pendingShortMessage, /Stop Loss: <b>Close Over 103\.55<\/b>/);
  assert.match(pendingLongMessage, /Stop Loss: <b>Close Under 121\.2<\/b>/);
  assert.match(setupShortMessage, /🛑 Stop Loss: <b>Close Over 103\.55<\/b>/);
  assert.match(fillLongMessage, /🛑 Stop Loss: <b>Close Under 121\.2<\/b>/);
  for (const message of [pendingShortMessage, pendingLongMessage, setupShortMessage, fillLongMessage]) {
    assert.doesNotMatch(message, /confirmed opposite signal|Stop Loss Ref|Stop Ref/);
  }

  let lifecycle = createLifecycleContext();

  const filledId = 'VIXALE_EDGE:AAPL:60:LONG:1785254400000';
  const pending = edgePayload('PENDING_SETUP', filledId);
  await lifecycle(pending);
  await lifecycle(pending);

  assert.strictEqual(sheets.rows.Pending.length, 2, 'PENDING_SETUP inserts one row');
  assert.strictEqual(sheets.rows.Pending[1][0], filledId, 'Pending is keyed by setup_id');
  assert.strictEqual(telegram.length, 0, 'PENDING_SETUP sends no Telegram');
  assert.deepStrictEqual(bridgeNetwork, [], 'PENDING_SETUP never forwards to bridge');

  await lifecycle(edgePayload('SETUP', filledId));
  assert.strictEqual(sheets.rows.Pending.length, 2, 'SETUP preserves Pending before broker fill');
  assert.deepStrictEqual(bridgeNetwork, ['SETUP'], 'SETUP remains execution-first');
  assert.strictEqual(telegram.length, 0, 'pre-broker SETUP sends no Telegram OPEN');

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
  assert.strictEqual(
    telegram.filter(message => message.includes('setup canceled')).length,
    0,
    'PENDING_ONLY CANCEL sends no Telegram'
  );
  assert.strictEqual(
    telegram.length,
    1,
    'only the broker-confirmed Edge OPEN has reached Telegram'
  );

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

  // Broker-confirmed manual/external close is persistent and idempotent.
  const externalSheets = createMockSheets();
  const externalTelegram = [];
  const externalBridge = [];
  let failExternalTelegram = true;
  let externalLifecycle = createLifecycleContext({
    sheetStore: externalSheets,
    telegramStore: externalTelegram,
    bridgeStore: externalBridge,
    telegramSender: async message => {
      if (message.includes('Vixale Edge closed manually') && failExternalTelegram) {
        failExternalTelegram = false;
        return { ok: false, description: 'mock manual-close Telegram failure' };
      }
      externalTelegram.push(message);
      return { ok: true };
    },
  });
  const externalId = 'VIXALE_EDGE:TSLA:60:LONG:1785280800000';
  await externalLifecycle(edgePayload('PENDING_SETUP', externalId, {
    symbol: 'TSLA',
    flip_bar_time: 1785280800000,
  }));
  await externalLifecycle(edgePayload('ENTRY_FILL', externalId, {
    symbol: 'TSLA',
    flip_bar_time: 1785280800000,
    render_forwarded_at: '2026-07-28T14:00:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));

  const reconciliationId = `${externalId}:EXEC:MANUAL-TSLA-1`;
  const externalClose = edgePayload('EXTERNAL_CLOSE', externalId, {
    source: 'IB_BRIDGE',
    symbol: 'TSLA',
    flip_bar_time: 1785280800000,
    price: 122.17,
    qty: 10,
    render_forwarded_at: '2026-07-28T15:00:00-04:00',
    ib_status: 'position_flat_reconciled',
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: 'EXEC:MANUAL-TSLA-1',
    reconciliation_id: reconciliationId,
    exit_price_available: true,
    exit_quantity_available: true,
    reason: 'IB_POSITION_FLAT_EXTERNAL_EXECUTION',
  });
  await externalLifecycle({
    ...externalClose,
    broker_confirmed_flat: false,
  });
  await externalLifecycle({
    ...externalClose,
    source: 'TradingView',
  });
  assert.strictEqual(
    countRowsBySetupId(externalSheets.rows['Open Positions'], 11, externalId),
    1,
    'unconfirmed or non-bridge EXTERNAL_CLOSE cannot remove Open'
  );
  assert.strictEqual(
    externalSheets.rows.Trades
      .slice(1)
      .filter(row => JSON.parse(row[10] || '{}').reconciliation_id === reconciliationId)
      .length,
    0,
    'unconfirmed or non-bridge EXTERNAL_CLOSE creates no Trades close'
  );
  assert.strictEqual(
    externalSheets.rows['Closed Trades'].length,
    1,
    'unconfirmed or non-bridge EXTERNAL_CLOSE creates no Closed row'
  );
  assert.strictEqual(
    externalTelegram.filter(message => message.includes('Vixale Edge closed manually')).length,
    0,
    'unconfirmed or non-bridge EXTERNAL_CLOSE sends no Telegram'
  );
  await assert.rejects(
    externalLifecycle(externalClose),
    error => error.retryable === true
  );
  const recoveredExternal = await externalLifecycle(externalClose);
  const duplicateExternal = await externalLifecycle(externalClose);
  assert.strictEqual(recoveredExternal.finalRow.status, 'external_close_publication_complete');
  assert.strictEqual(duplicateExternal.finalRow.status, 'ignored_duplicate_external_close');
  assert.strictEqual(
    countRowsBySetupId(externalSheets.rows['Open Positions'], 11, externalId),
    0,
    'EXTERNAL_CLOSE removes the exact Edge Open row'
  );
  assert.strictEqual(
    externalSheets.rows.Trades
      .slice(1)
      .filter(row => JSON.parse(row[10] || '{}').reconciliation_id === reconciliationId)
      .length,
    1,
    'duplicate EXTERNAL_CLOSE creates one Trades close row'
  );
  assert.strictEqual(
    externalSheets.rows['Closed Trades'].length - 1,
    1,
    'duplicate EXTERNAL_CLOSE creates one Closed row'
  );
  const manualClosedRow = externalSheets.rows['Closed Trades'][1];
  assert.strictEqual(manualClosedRow[6], 122.17, 'manual close stores the actual IB execution price');
  assert.strictEqual(manualClosedRow[8], '', 'manual close stores no invented P&L');
  assert.strictEqual(manualClosedRow[9], 'Manual Close');
  assert.strictEqual(publicExitLabel('EXTERNAL_CLOSE'), 'Manual Close');
  assert.strictEqual(
    closedTradeExitDisplay({ event: 'Manual Close', exit: '' }),
    'Manual Close — price unavailable'
  );
  assert.strictEqual(
    externalTelegram.filter(message => message.includes('Vixale Edge closed manually')).length,
    1,
    'duplicate EXTERNAL_CLOSE sends one manual-close Telegram'
  );
  assert.ok(
    externalTelegram.some(message => message.includes('Manual Close: <b>122.17</b>')),
    `manual close publishes the actual execution price: ${JSON.stringify(externalTelegram)}`
  );
  assert.strictEqual(
    externalBridge.filter(event => event === 'EXTERNAL_CLOSE').length,
    0,
    'EXTERNAL_CLOSE callback never forwards to bridge'
  );

  externalLifecycle = createLifecycleContext({
    sheetStore: externalSheets,
    telegramStore: externalTelegram,
    bridgeStore: externalBridge,
  });
  const restartExternalDuplicate = await externalLifecycle(externalClose);
  assert.strictEqual(
    restartExternalDuplicate.finalRow.status,
    'ignored_duplicate_external_close',
    'persistent Sheets state rejects EXTERNAL_CLOSE after lifecycle recreation'
  );
  assert.strictEqual(
    externalTelegram.filter(message => message.includes('Vixale Edge closed manually')).length,
    1
  );

  // Manual close with an actual IB execution preserves price/qty but never P&L.
  const actualExternalSheets = createMockSheets();
  const actualExternalTelegram = [];
  const actualExternalBridge = [];
  const actualExternalLifecycle = createLifecycleContext({
    sheetStore: actualExternalSheets,
    telegramStore: actualExternalTelegram,
    bridgeStore: actualExternalBridge,
  });
  const actualExternalId = 'VIXALE_EDGE:META:60:LONG:1785284400000';
  await actualExternalLifecycle(edgePayload('PENDING_SETUP', actualExternalId, {
    symbol: 'META',
    flip_bar_time: 1785284400000,
  }));
  await actualExternalLifecycle(edgePayload('ENTRY_FILL', actualExternalId, {
    symbol: 'META',
    flip_bar_time: 1785284400000,
    render_forwarded_at: '2026-07-28T15:10:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const actualReconciliationId = `${actualExternalId}:EXEC:MANUAL-META-1`;
  const actualExternalResult = await actualExternalLifecycle(
    edgePayload('EXTERNAL_CLOSE', actualExternalId, {
      source: 'IB_BRIDGE',
      symbol: 'META',
      flip_bar_time: 1785284400000,
      price: 130.25,
      qty: 7,
      result: 999,
      pnl: 999,
      result_pct: 88,
      pnl_pct: 88,
      render_forwarded_at: '2026-07-28T15:20:00-04:00',
      ib_status: 'position_flat_reconciled',
      broker_confirmed_flat: true,
      position_after_close: 0,
      exit_execution_id: 'EXEC:MANUAL-META-1',
      reconciliation_id: actualReconciliationId,
      exit_price_available: true,
      exit_quantity_available: true,
      reason: 'IB_POSITION_FLAT_EXTERNAL_EXECUTION',
    })
  );
  assert.strictEqual(actualExternalResult.finalRow.result, '');
  assert.strictEqual(actualExternalResult.finalRow.result_pct, '');
  assert.strictEqual(
    actualExternalSheets.rows.Trades
      .slice(1)
      .filter(row => JSON.parse(row[10] || '{}').reconciliation_id === actualReconciliationId)
      .length,
    1,
    'actual-price EXTERNAL_CLOSE creates one Trades close'
  );
  const actualTradesClose = actualExternalSheets.rows.Trades
    .slice(1)
    .find(row => JSON.parse(row[10] || '{}').reconciliation_id === actualReconciliationId);
  assert.strictEqual(actualTradesClose[5], 7, 'actual exit quantity is preserved in Trades');
  assert.strictEqual(actualTradesClose[6], 130.25, 'actual exit price is preserved in Trades');
  assert.strictEqual(actualTradesClose[8], '', 'Trades stores no Manual Close P&L');
  assert.strictEqual(
    actualExternalSheets.rows['Closed Trades'].length,
    2,
    'actual-price EXTERNAL_CLOSE creates one Closed row'
  );
  const actualClosed = actualExternalSheets.rows['Closed Trades'][1];
  assert.strictEqual(actualClosed[6], 130.25, 'actual exit price is preserved in Closed Trades');
  assert.strictEqual(actualClosed[7], 7, 'actual exit quantity is preserved in Closed Trades');
  assert.strictEqual(actualClosed[8], '', 'Closed Trades stores no Manual Close P&L');
  const actualMetadata = actualExternalSheets.rows['Trade Metadata'][1];
  const actualCloseRaw = JSON.parse(actualMetadata[13] || '{}');
  assert.strictEqual(actualCloseRaw.result, '');
  assert.strictEqual(actualCloseRaw.result_pct, '');
  assert.strictEqual(actualCloseRaw.pnl, '');
  assert.strictEqual(actualCloseRaw.pnl_pct, '');
  assert.strictEqual(
    actualExternalTelegram.filter(message => message.includes('Vixale Edge closed manually')).length,
    1,
    'actual-price EXTERNAL_CLOSE sends one Manual Close Telegram'
  );
  assert.ok(
    actualExternalTelegram.some(message => message.includes('Manual Close: <b>130.25</b>')),
    `actual execution price appears in Manual Close Telegram: ${JSON.stringify(actualExternalTelegram)}`
  );
  assert.ok(
    actualExternalTelegram.every(message => !message.includes('999') && !message.includes('88')),
    'supplied callback P&L is ignored'
  );
  assert.strictEqual(
    actualExternalBridge.filter(event => event === 'EXTERNAL_CLOSE').length,
    0,
    'actual-price EXTERNAL_CLOSE never forwards to bridge'
  );

  // Partial target plus an attributed manual remainder is one full-size
  // Manual Close, is restart-idempotent, and never calculates P&L.
  const mixedManualSheets = createMockSheets();
  const mixedManualTelegram = [];
  const mixedManualBridge = [];
  let mixedManualLifecycle = createLifecycleContext({
    sheetStore: mixedManualSheets,
    telegramStore: mixedManualTelegram,
    bridgeStore: mixedManualBridge,
  });
  const mixedManualSetupId = 'VIXALE_EDGE:AMD:60:LONG:1785288000000';
  await mixedManualLifecycle(edgePayload('PENDING_SETUP', mixedManualSetupId, {
    symbol: 'AMD',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785288000000,
  }));
  await mixedManualLifecycle(edgePayload('ENTRY_FILL', mixedManualSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'AMD',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785288000000,
    render_forwarded_at: '2026-07-28T15:20:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const mixedManualExecutionId = 'EXEC:MANUAL-AMD-7,TARGET-AMD-3';
  const mixedManualReconciliationId =
    `${mixedManualSetupId}:${mixedManualExecutionId}`;
  const mixedManualExit = edgePayload('EXTERNAL_CLOSE', mixedManualSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'AMD',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785288000000,
    price: 100.8,
    qty: 10,
    result: 500,
    result_pct: 50,
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: mixedManualExecutionId,
    reconciliation_id: mixedManualReconciliationId,
    exit_price_available: true,
    exit_quantity_available: true,
    reason: 'IB_MANUAL_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED',
    original_position_qty: 10,
    target_partial_filled_qty: 3,
    target_partial_fill_price: 105,
    target_partial_exec_ids: ['TARGET-AMD-3'],
    external_close_filled_qty: 7,
    external_close_fill_price: 99,
    external_close_exec_ids: ['MANUAL-AMD-7'],
    mixed_exit_weighted_price: 100.8,
    mixed_exit_total_qty: 10,
    mixed_exit_exec_ids: ['MANUAL-AMD-7', 'TARGET-AMD-3'],
    mixed_exit_evidence_complete: true,
  });
  const mixedManualResult = await mixedManualLifecycle(mixedManualExit);
  assert.strictEqual(
    mixedManualResult.finalRow.status,
    'external_close_publication_complete'
  );
  assert.strictEqual(mixedManualResult.finalRow.result, '');
  assert.strictEqual(mixedManualResult.finalRow.result_pct, '');
  const mixedManualTrade = mixedManualSheets.rows.Trades
    .slice(1)
    .find(row => JSON.parse(row[10] || '{}').reconciliation_id ===
      mixedManualReconciliationId);
  const mixedManualClosed = mixedManualSheets.rows['Closed Trades'][1];
  assert.strictEqual(mixedManualTrade[5], 10);
  assert.strictEqual(mixedManualTrade[6], 100.8);
  assert.strictEqual(mixedManualTrade[8], '');
  assert.strictEqual(mixedManualClosed[7], 10);
  assert.strictEqual(mixedManualClosed[6], 100.8);
  assert.strictEqual(mixedManualClosed[8], '');
  assert.strictEqual(
    mixedManualTelegram.filter(
      message => message.includes('Vixale Edge closed manually')
    ).length,
    1
  );
  assert.strictEqual(mixedManualBridge.length, 0);
  const mixedManualActivity = {
    trades: mixedManualSheets.rows.Trades.length,
    closed: mixedManualSheets.rows['Closed Trades'].length,
    telegram: mixedManualTelegram.length,
    bridge: mixedManualBridge.length,
  };
  mixedManualLifecycle = createLifecycleContext({
    sheetStore: mixedManualSheets,
    telegramStore: mixedManualTelegram,
    bridgeStore: mixedManualBridge,
  });
  const duplicateMixedManual = await mixedManualLifecycle(mixedManualExit);
  assert.strictEqual(
    duplicateMixedManual.finalRow.status,
    'ignored_duplicate_external_close'
  );
  assert.deepStrictEqual({
    trades: mixedManualSheets.rows.Trades.length,
    closed: mixedManualSheets.rows['Closed Trades'].length,
    telegram: mixedManualTelegram.length,
    bridge: mixedManualBridge.length,
  }, mixedManualActivity, 'mixed Manual Close retry after restart is ignored');

  // Broker-confirmed TP publication is synchronous, repairable, and persistent.
  const tpSheets = createMockSheets();
  const tpTelegram = [];
  const tpBridge = [];
  let failTargetTelegram = true;
  let tpLifecycle = createLifecycleContext({
    sheetStore: tpSheets,
    telegramStore: tpTelegram,
    bridgeStore: tpBridge,
    telegramSender: async message => {
      if (message.includes('Vixale Edge hit target') && failTargetTelegram) {
        failTargetTelegram = false;
        return { ok: false, description: 'mock Edge TP Telegram failure' };
      }
      tpTelegram.push(message);
      return { ok: true };
    },
  });
  const tpSetupId = 'VIXALE_EDGE:GOOG:60:LONG:1785288000000';
  await tpLifecycle(edgePayload('PENDING_SETUP', tpSetupId, {
    symbol: 'GOOG',
    flip_bar_time: 1785288000000,
  }));
  await tpLifecycle(edgePayload('ENTRY_FILL', tpSetupId, {
    symbol: 'GOOG',
    flip_bar_time: 1785288000000,
    source: 'IB_BRIDGE',
    render_forwarded_at: '2026-07-28T15:30:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const tpReconciliationId = `${tpSetupId}:EXEC:TP-GOOG-1`;
  const tpExit = edgePayload('TP', tpSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'GOOG',
    flip_bar_time: 1785288000000,
    price: 127.8,
    qty: 10,
    ib_target_status: 'Filled',
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: 'EXEC:TP-GOOG-1',
    delivery_id: 'TP:GOOG:test-delivery',
    reconciliation_id: tpReconciliationId,
    reason: 'IB_TARGET_EXECUTION_CONFIRMED',
  });
  await tpLifecycle({ ...tpExit, source: 'TradingView' });
  await tpLifecycle({ ...tpExit, exit_execution_id: '' });
  assert.strictEqual(
    countRowsBySetupId(tpSheets.rows['Open Positions'], 11, tpSetupId),
    1,
    'non-bridge or identity-free TP callback cannot remove Open'
  );
  assert.strictEqual(
    countRowsByReconciliation(tpSheets.rows.Trades, 10, tpReconciliationId, 'TP'),
    0,
    'invalid TP callback creates no Trades exit'
  );
  const tpFailureResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: tpExit },
    tpFailureResponse,
    tpLifecycle.dependencies
  );
  assert.strictEqual(tpFailureResponse.statusCode, 503);
  assert.strictEqual(tpFailureResponse.body, 'RETRY');
  assert.strictEqual(
    countRowsBySetupId(tpSheets.rows['Open Positions'], 11, tpSetupId),
    0,
    'TP Telegram failure retains the completed Open removal component'
  );
  assert.strictEqual(
    countRowsByReconciliation(tpSheets.rows.Trades, 10, tpReconciliationId, 'TP'),
    1,
    'TP Telegram failure writes one Trades exit'
  );
  assert.strictEqual(
    tpSheets.rows['Closed Trades'].length - 1,
    1,
    'TP Telegram failure writes one Closed Trade'
  );
  tpSheets.rows['Trade Metadata'][1] = tpSheets.rows['Trade Metadata'][1].slice(0, 15);
  const recoveredTp = await tpLifecycle(tpExit);
  assert.strictEqual(recoveredTp.finalRow.status, 'edge_broker_exit_publication_complete');
  assert.strictEqual(
    tpTelegram.filter(message => message.includes('Vixale Edge hit target')).length,
    1,
    'TP retry publishes one successful Telegram target'
  );
  assert.strictEqual(
    countRowsByReconciliation(tpSheets.rows.Trades, 10, tpReconciliationId, 'TP'),
    1,
    'TP retry does not duplicate Trades'
  );
  assert.strictEqual(
    tpSheets.rows['Closed Trades'].length - 1,
    1,
    'TP retry does not duplicate Closed Trades'
  );
  tpLifecycle = createLifecycleContext({
    sheetStore: tpSheets,
    telegramStore: tpTelegram,
    bridgeStore: tpBridge,
  });
  const duplicateTp = await tpLifecycle(tpExit);
  assert.strictEqual(duplicateTp.finalRow.status, 'ignored_duplicate_edge_broker_exit');
  assert.strictEqual(
    tpTelegram.filter(message => message.includes('Vixale Edge hit target')).length,
    1,
    'completed TP duplicate after lifecycle recreation is ignored'
  );
  assert.strictEqual(
    countMetadataRowsByReconciliation(tpSheets.rows['Trade Metadata'], tpReconciliationId, 'TP'),
    1,
    'TP retries keep one authoritative Trade Metadata row'
  );
  const tpMetadata = tpSheets.rows['Trade Metadata'].slice(1)
    .find(row => row[16] === tpReconciliationId);
  assert.strictEqual(tpMetadata[17], 'TP:GOOG:test-delivery');
  assert.strictEqual(tpMetadata[18], 'EXEC:TP-GOOG-1');
  assert.strictEqual(tpMetadata[19], true);
  assert.strictEqual(tpMetadata[20], 0);
  assert.strictEqual(tpMetadata[21], true);
  assert.strictEqual(tpMetadata[22], true);
  assert.strictEqual(tpMetadata[23], true);
  assert.ok(tpMetadata[24], 'TP completion timestamp is durable in Trade Metadata');
  assert.strictEqual(
    tpBridge.filter(event => event === 'TP').length,
    0,
    'TP callback never forwards to bridge'
  );

  // Broker-confirmed CLOSE_STOP repairs a retryable Sheets failure without duplicates.
  const stopSheets = createMockSheets();
  const stopTelegram = [];
  const stopBridge = [];
  let stopLifecycle = createLifecycleContext({
    sheetStore: stopSheets,
    telegramStore: stopTelegram,
    bridgeStore: stopBridge,
  });
  const stopSetupId = 'VIXALE_EDGE:AMZN:60:LONG:1785291600000';
  await stopLifecycle(edgePayload('PENDING_SETUP', stopSetupId, {
    symbol: 'AMZN',
    flip_bar_time: 1785291600000,
  }));
  await stopLifecycle(edgePayload('ENTRY_FILL', stopSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'AMZN',
    flip_bar_time: 1785291600000,
    render_forwarded_at: '2026-07-28T15:35:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const stopReconciliationId = `${stopSetupId}:EXEC:STOP-AMZN-1`;
  const stopExit = edgePayload('CLOSE_STOP', stopSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'AMZN',
    flip_bar_time: 1785291600000,
    price: 121.1,
    qty: 10,
    ib_close_status: 'Filled',
    close_filled: true,
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: 'EXEC:STOP-AMZN-1',
    reconciliation_id: stopReconciliationId,
    reason: 'IB_STOP_CLOSE_EXECUTION_CONFIRMED',
  });
  stopSheets.controls.fail_closed_append = 1;
  const stopFailureResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: stopExit },
    stopFailureResponse,
    stopLifecycle.dependencies
  );
  assert.strictEqual(stopFailureResponse.statusCode, 503);
  assert.strictEqual(stopFailureResponse.body, 'RETRY');
  assert.strictEqual(
    countRowsBySetupId(stopSheets.rows['Open Positions'], 11, stopSetupId),
    1,
    'CLOSE_STOP Sheets failure keeps the Open row for repair'
  );
  assert.strictEqual(
    countRowsByReconciliation(
      stopSheets.rows.Trades,
      10,
      stopReconciliationId,
      'CLOSE_STOP'
    ),
    1,
    'CLOSE_STOP partial failure preserves the already-written Trades exit'
  );
  assert.strictEqual(
    stopSheets.rows['Closed Trades'].length - 1,
    0,
    'CLOSE_STOP partial failure leaves only the missing Closed Trade to repair'
  );
  const recoveredStop = await stopLifecycle(stopExit);
  assert.strictEqual(recoveredStop.finalRow.status, 'edge_broker_exit_publication_complete');
  assert.strictEqual(
    countRowsByReconciliation(
      stopSheets.rows.Trades,
      10,
      stopReconciliationId,
      'CLOSE_STOP'
    ),
    1,
    'CLOSE_STOP retry writes one Trades exit'
  );
  assert.strictEqual(
    stopSheets.rows['Closed Trades'].length - 1,
    1,
    'CLOSE_STOP retry writes one Closed Trade'
  );
  assert.strictEqual(
    stopTelegram.filter(message => message.includes('Vixale Edge hit Stop Loss')).length,
    1,
    'CLOSE_STOP retry publishes one Stop Loss Telegram'
  );
  stopLifecycle = createLifecycleContext({
    sheetStore: stopSheets,
    telegramStore: stopTelegram,
    bridgeStore: stopBridge,
  });
  const duplicateStop = await stopLifecycle(stopExit);
  assert.strictEqual(duplicateStop.finalRow.status, 'ignored_duplicate_edge_broker_exit');
  assert.strictEqual(
    stopTelegram.filter(message => message.includes('Vixale Edge hit Stop Loss')).length,
    1,
    'completed CLOSE_STOP duplicate after lifecycle recreation is ignored'
  );
  assert.strictEqual(
    stopBridge.filter(event => event === 'SL').length,
    0,
    'CLOSE_STOP callback never forwards to bridge'
  );

  // A partial target plus Stop Loss publishes one full-size weighted close.
  const mixedSheets = createMockSheets();
  const mixedTelegram = [];
  const mixedBridge = [];
  let mixedLifecycle = createLifecycleContext({
    sheetStore: mixedSheets,
    telegramStore: mixedTelegram,
    bridgeStore: mixedBridge,
  });
  const mixedSetupId = 'VIXALE_EDGE:META:60:LONG:1785293400000';
  await mixedLifecycle(edgePayload('PENDING_SETUP', mixedSetupId, {
    symbol: 'META',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785293400000,
  }));
  await mixedLifecycle(edgePayload('ENTRY_FILL', mixedSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'META',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785293400000,
    render_forwarded_at: '2026-07-28T15:38:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const mixedExecutionId = 'EXEC:STOP-META-2,STOP-META-5,TARGET-META-3';
  const mixedReconciliationId = `${mixedSetupId}:${mixedExecutionId}`;
  const mixedExit = edgePayload('CLOSE_STOP', mixedSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'META',
    entry: 100,
    planned_limit_entry: 100,
    target: 105,
    stop: 98,
    flip_bar_time: 1785293400000,
    price: 99.6,
    qty: 10,
    ib_close_status: 'Filled',
    close_filled: true,
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: mixedExecutionId,
    reconciliation_id: mixedReconciliationId,
    reason: 'IB_STOP_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED',
    original_position_qty: 10,
    target_partial_filled_qty: 3,
    target_partial_fill_price: 105,
    target_partial_exec_ids: ['TARGET-META-3'],
    expected_remaining_qty: 7,
    confirmed_remaining_qty: 7,
    stop_close_filled_qty: 7,
    stop_close_fill_price: 97.2857,
    stop_close_exec_ids: ['STOP-META-2', 'STOP-META-5'],
    close_attempts: [
      {
        attempt: 1,
        order_id: 3001,
        perm_id: 33001,
        order_ref: 'TVFVG_CLOSE_META_MULTI',
        filled_qty: 2,
        avg_fill_price: 98,
        exec_ids: ['STOP-META-2'],
      },
      {
        attempt: 2,
        order_id: 3002,
        perm_id: 33002,
        order_ref: 'TVFVG_CLOSE_META_MULTI_2',
        filled_qty: 5,
        avg_fill_price: 97,
        exec_ids: ['STOP-META-5'],
      },
    ],
    mixed_exit_weighted_price: 99.6,
    mixed_exit_total_qty: 10,
    mixed_exit_exec_ids: ['STOP-META-2', 'STOP-META-5', 'TARGET-META-3'],
    mixed_exit_evidence_complete: true,
  });
  const mixedResult = await mixedLifecycle(mixedExit);
  assert.strictEqual(
    mixedResult.finalRow.status,
    'edge_broker_exit_publication_complete'
  );
  assert.strictEqual(
    countRowsByReconciliation(
      mixedSheets.rows.Trades,
      10,
      mixedReconciliationId,
      'CLOSE_STOP'
    ),
    1,
    'mixed exit writes one final Trades CLOSE_STOP'
  );
  assert.strictEqual(
    mixedSheets.rows['Closed Trades'].length - 1,
    1,
    'mixed exit writes one final Closed Trades CLOSE_STOP'
  );
  const mixedTradesClose = mixedSheets.rows.Trades
    .slice(1)
    .find(row => JSON.parse(row[10] || '{}').reconciliation_id === mixedReconciliationId);
  const mixedClosed = mixedSheets.rows['Closed Trades'][1];
  const mixedMetadata = mixedSheets.rows['Trade Metadata']
    .slice(1)
    .find(row => row[16] === mixedReconciliationId);
  assert.strictEqual(mixedTradesClose[5], 10, 'mixed Trades close uses full original qty');
  assert.strictEqual(mixedTradesClose[6], 99.6, 'mixed Trades close uses weighted exit');
  assert.strictEqual(mixedClosed[7], 10, 'mixed Closed Trade uses full original qty');
  assert.strictEqual(mixedClosed[6], 99.6, 'mixed Closed Trade uses weighted exit');
  const mixedTradesRaw = JSON.parse(mixedTradesClose[10] || '{}');
  const mixedClosedRaw = JSON.parse(mixedMetadata[13] || '{}');
  for (const raw of [mixedTradesRaw, mixedClosedRaw]) {
    assert.deepStrictEqual(
      raw.target_partial_exec_ids,
      ['TARGET-META-3'],
      'mixed raw JSON preserves target execution IDs'
    );
    assert.deepStrictEqual(
      raw.stop_close_exec_ids,
      ['STOP-META-2', 'STOP-META-5'],
      'mixed raw JSON preserves Stop Loss execution IDs'
    );
    assert.deepStrictEqual(
      raw.mixed_exit_exec_ids,
      ['STOP-META-2', 'STOP-META-5', 'TARGET-META-3'],
      'mixed raw JSON preserves all component execution IDs'
    );
    assert.strictEqual(raw.target_partial_filled_qty, 3);
    assert.strictEqual(raw.target_partial_fill_price, 105);
    assert.strictEqual(raw.stop_close_filled_qty, 7);
    assert.strictEqual(raw.stop_close_fill_price, 97.2857);
    assert.strictEqual(raw.close_attempts.length, 2);
  }
  assert.strictEqual(
    mixedTelegram.filter(message => message.includes('Vixale Edge hit Stop Loss')).length,
    1,
    'mixed exit sends one Stop Loss Telegram'
  );
  assert.strictEqual(
    countRowsBySetupEvent(mixedSheets.rows.Trades, 10, mixedSetupId, 'TP'),
    0,
    'partial target creates no standalone TP row'
  );
  assert.strictEqual(
    mixedBridge.filter(event => event === 'CLOSE_STOP').length,
    0,
    'broker-confirmed mixed close never forwards back to bridge'
  );
  const mixedActivity = {
    trades: mixedSheets.rows.Trades.length,
    closed: mixedSheets.rows['Closed Trades'].length,
    telegram: mixedTelegram.length,
    bridge: mixedBridge.length,
  };
  mixedLifecycle = createLifecycleContext({
    sheetStore: mixedSheets,
    telegramStore: mixedTelegram,
    bridgeStore: mixedBridge,
  });
  const duplicateMixed = await mixedLifecycle(mixedExit);
  assert.strictEqual(
    duplicateMixed.finalRow.status,
    'ignored_duplicate_edge_broker_exit'
  );
  assert.deepStrictEqual({
    trades: mixedSheets.rows.Trades.length,
    closed: mixedSheets.rows['Closed Trades'].length,
    telegram: mixedTelegram.length,
    bridge: mixedBridge.length,
  }, mixedActivity, 'mixed close retry after restart creates no duplicates');

  // The HTTP route cannot send final 200 before Edge exit publication completes.
  const routeSheets = createMockSheets();
  const routeTelegram = [];
  const routeBridge = [];
  const routeLifecycle = createLifecycleContext({
    sheetStore: routeSheets,
    telegramStore: routeTelegram,
    bridgeStore: routeBridge,
  });
  const routeSetupId = 'VIXALE_EDGE:NFLX:60:LONG:1785295200000';
  await routeLifecycle(edgePayload('PENDING_SETUP', routeSetupId, {
    symbol: 'NFLX',
    flip_bar_time: 1785295200000,
  }));
  await routeLifecycle(edgePayload('ENTRY_FILL', routeSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'NFLX',
    flip_bar_time: 1785295200000,
    render_forwarded_at: '2026-07-28T15:40:00-04:00',
    ib_status: 'FILLED',
    entry_filled: true,
  }));
  const routeReconciliationId = `${routeSetupId}:EXEC:TP-NFLX-1`;
  const routeExit = edgePayload('TP', routeSetupId, {
    source: 'IB_BRIDGE',
    symbol: 'NFLX',
    flip_bar_time: 1785295200000,
    price: 127.8,
    qty: 10,
    ib_target_status: 'Filled',
    broker_confirmed_flat: true,
    position_after_close: 0,
    exit_execution_id: 'EXEC:TP-NFLX-1',
    reconciliation_id: routeReconciliationId,
  });
  let releaseRouteTelegram;
  let routeTelegramStarted;
  const routeTelegramGate = new Promise(resolve => {
    releaseRouteTelegram = resolve;
  });
  const routeTelegramStart = new Promise(resolve => {
    routeTelegramStarted = resolve;
  });
  const routeResponse = {
    sent: false,
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.sent = true;
      this.body = body;
      return this;
    },
  };
  const routePromise = handleTradingViewWebhookWithDependencies(
    { body: routeExit },
    routeResponse,
    {
      sheets: routeSheets,
      sendTelegram: async message => {
        if (message.includes('Vixale Edge hit target')) {
          routeTelegramStarted();
          await routeTelegramGate;
        }
        routeTelegram.push(message);
        return { ok: true };
      },
      forwardToBridge: async (body, row) => {
        const decision = shouldForwardToBridge(body, row);
        if (decision.ok) routeBridge.push(row.event);
        return { forwarded: decision.ok, skipped: !decision.ok };
      },
    }
  );
  await routeTelegramStart;
  let routeDuplicateSettled = false;
  const routeDuplicate = routeLifecycle(routeExit).then(result => {
    routeDuplicateSettled = true;
    return result;
  });
  await Promise.resolve();
  assert.strictEqual(
    routeResponse.sent,
    false,
    'Render does not send final 200 while Telegram publication is pending'
  );
  assert.strictEqual(
    routeDuplicateSettled,
    false,
    'concurrent Edge exit callback awaits the same in-flight publication'
  );
  releaseRouteTelegram();
  const [, routeDuplicateResult] = await Promise.all([
    routePromise,
    routeDuplicate,
  ]);
  assert.strictEqual(routeResponse.statusCode, 200);
  assert.strictEqual(routeResponse.body, 'OK');
  assert.strictEqual(
    routeDuplicateResult.finalRow.status,
    'edge_broker_exit_publication_complete'
  );
  assert.strictEqual(
    routeTelegram.filter(message => message.includes('Vixale Edge hit target')).length,
    1,
    'concurrent Edge exit callbacks publish one Telegram message'
  );
  assert.strictEqual(
    routeSheets.rows['Trade Metadata'].at(-1)[23],
    true,
    'route 200 follows persistent publication completion'
  );

  // Ordinary TradingView delivery is acknowledged only after durable Inbox persistence.
  const ackOrder = [];
  const ackResponse = {
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.headersSent = true; this.body = body; ackOrder.push('ack'); return this; },
  };
  await handleTradingViewWebhookWithDependencies(
    { body: edgePayload('SETUP', 'VIXALE_EDGE:TLT:15:SHORT:1786368600000', {
      symbol: 'TLT', side: 'SHORT', timeframe: '15', flip_bar_time: 1786368600000,
    }) },
    ackResponse,
    {
      sheets: createMockSheets(),
      upsertWebhookInboxItem: async () => {
        ackOrder.push('persist_start');
        await Promise.resolve();
        ackOrder.push('persist_complete');
        return { delivery_id: 'TV:SETUP:TLT:test', status: 'PENDING', row_number: 2 };
      },
      scheduleWebhookInboxWork: () => ackOrder.push('scheduled'),
    }
  );
  assert.deepStrictEqual(ackOrder, ['persist_start', 'persist_complete', 'ack', 'scheduled']);
  assert.strictEqual(ackResponse.statusCode, 200);

  // A failed authoritative Inbox write returns 503; retry persists and publishes
  // one Telegram-silent Pending row without sending anything to the bridge.
  const pendingInboxSheets = createMockSheets();
  const pendingInboxPayload = edgePayload(
    'PENDING_SETUP',
    'VIXALE_EDGE:SLB:15:LONG:1786368600000',
    { symbol: 'SLB', timeframe: '15', flip_bar_time: 1786368600000 }
  );
  let rejectFirstInboxWrite = true;
  let fallbackSpoolWrites = 0;
  let pendingScheduledWork = null;
  let pendingTelegramCalls = 0;
  let pendingBridgeCalls = 0;
  const pendingEndpointDependencies = {
    sheets: pendingInboxSheets,
    upsertWebhookInboxItem: async (...args) => {
      if (rejectFirstInboxWrite) {
        rejectFirstInboxWrite = false;
        throw new Error('mock authoritative Inbox outage');
      }
      return upsertWebhookInboxItem(...args);
    },
    spoolWebhookInboxItem: () => { fallbackSpoolWrites++; return true; },
    scheduleWebhookInboxWork: work => { pendingScheduledWork = work(); },
    sendTelegram: async () => { pendingTelegramCalls++; return { ok: true }; },
    forwardToBridge: async (raw, row) => {
      if (shouldForwardToBridge(raw, row).ok) {
        pendingBridgeCalls++;
        return { forwarded: true };
      }
      return { forwarded: false, skipped: true };
    },
  };
  const failedPendingResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: pendingInboxPayload },
    failedPendingResponse,
    pendingEndpointDependencies
  );
  assert.strictEqual(failedPendingResponse.statusCode, 503);
  assert.strictEqual(fallbackSpoolWrites, 1);
  assert.strictEqual(pendingInboxSheets.rows['Webhook Inbox'].length - 1, 0);

  const retriedPendingResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: { ...pendingInboxPayload } },
    retriedPendingResponse,
    pendingEndpointDependencies
  );
  assert.strictEqual(retriedPendingResponse.statusCode, 200);
  await pendingScheduledWork;
  assert.strictEqual(pendingInboxSheets.rows['Webhook Inbox'].length - 1, 1);
  assert.strictEqual(pendingInboxSheets.rows.Pending.length - 1, 1);
  assert.strictEqual(pendingTelegramCalls, 0);
  assert.strictEqual(pendingBridgeCalls, 0);

  // Four duplicate identities share one Inbox row and one downstream execution.
  const inboxSheets = createMockSheets();
  const inboxPayload = edgePayload('SETUP', 'VIXALE_EDGE:TLT:15:SHORT:1786368600000', {
    symbol: 'TLT', side: 'SHORT', timeframe: '15', flip_bar_time: 1786368600000,
  });
  const parsedInboxPayload = parseJsonTradingViewAlert(inboxPayload);
  const duplicateDeliveries = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    duplicateDeliveries.push(await upsertWebhookInboxItem(
      inboxSheets,
      { ...inboxPayload },
      parseJsonTradingViewAlert({ ...inboxPayload }),
      new Date().toISOString()
    ));
  }
  const firstInbox = duplicateDeliveries[0];
  assert.strictEqual(firstInbox.delivery_id, webhookInboundDeliveryId(inboxPayload, parsedInboxPayload));
  assert.ok(duplicateDeliveries.every(item => item.delivery_id === firstInbox.delivery_id));
  assert.strictEqual(inboxSheets.rows['Webhook Inbox'].length - 1, 1);
  let inboxBridgeAttempts = 0;
  const inboxDependencies = {
    sheets: inboxSheets,
    forwardToBridge: async () => {
      inboxBridgeAttempts++;
      return { forwarded: true };
    },
  };
  for (const delivery of duplicateDeliveries) {
    await processWebhookInboxItem(delivery, inboxDependencies);
  }
  assert.strictEqual(inboxBridgeAttempts, 1, 'duplicate Inbox work executes downstream once');
  assert.strictEqual(inboxSheets.rows['Webhook Inbox'][1][7], 'COMPLETE');

  // A downstream ledger write failure remains retryable and later produces one row.
  const retrySheets = createMockSheets();
  const retryPayload = edgePayload(
    'PENDING_SETUP',
    'VIXALE_EDGE:XLE:15:LONG:1786369500000',
    { symbol: 'XLE', timeframe: '15', flip_bar_time: 1786369500000 }
  );
  const retryItem = await upsertWebhookInboxItem(
    retrySheets,
    retryPayload,
    parseJsonTradingViewAlert(retryPayload),
    new Date().toISOString()
  );
  retrySheets.controls.fail_pending_write = 1;
  const retryDependencies = { sheets: retrySheets };
  const retained = await processWebhookInboxItem(retryItem, retryDependencies);
  assert.strictEqual(retained.status, 'RETRY');
  assert.ok(retained.next_attempt_at);
  assert.strictEqual(retrySheets.rows.Pending.length - 1, 0);
  const completedRetry = await processWebhookInboxItem(retained, retryDependencies);
  assert.strictEqual(completedRetry.status, 'COMPLETE');
  assert.strictEqual(retrySheets.rows['Webhook Inbox'].length - 1, 1);
  assert.strictEqual(retrySheets.rows.Pending.length - 1, 1);

  // Stale entry setups fail closed, while old close-safety work never expires.
  const staleSheets = createMockSheets();
  const staleSetupId = 'VIXALE_EDGE:STALE:15:LONG:1786368600000';
  const stalePayload = edgePayload('SETUP', staleSetupId, {
    symbol: 'STALE', timeframe: '15', flip_bar_time: 1786368600000,
  });
  staleSheets.rows.Pending.push([staleSetupId, '', 'STALE', 'LONG']);
  const staleItem = await upsertWebhookInboxItem(
    staleSheets,
    stalePayload,
    parseJsonTradingViewAlert(stalePayload),
    new Date(Date.now() - 10 * 60 * 1000).toISOString()
  );
  let staleBridgeCalls = 0;
  const staleResult = await processWebhookInboxItem(staleItem, {
    sheets: staleSheets,
    forwardToBridge: async () => { staleBridgeCalls++; return { forwarded: true }; },
  });
  assert.strictEqual(staleResult.status, 'STALE_EXECUTION_DROPPED');
  assert.strictEqual(staleBridgeCalls, 0);
  assert.strictEqual(staleSheets.rows.Pending.length, 1);

  const livePayload = edgePayload(
    'SETUP',
    'VIXALE_EDGE:LIVE:15:LONG:1786370400000',
    { symbol: 'LIVE', timeframe: '15', flip_bar_time: 1786370400000 }
  );
  const liveItem = await upsertWebhookInboxItem(
    staleSheets,
    livePayload,
    parseJsonTradingViewAlert(livePayload),
    new Date().toISOString()
  );
  let liveBridgeCalls = 0;
  const liveResult = await processWebhookInboxItem(liveItem, {
    sheets: staleSheets,
    forwardToBridge: async () => { liveBridgeCalls++; return { forwarded: true }; },
  });
  assert.strictEqual(liveResult.status, 'COMPLETE');
  assert.strictEqual(liveBridgeCalls, 1, 'stale work does not block another symbol');

  const safetyPayload = edgePayload('CLOSE_STOP', staleSetupId, {
    symbol: 'STALE', timeframe: '15', flip_bar_time: 1786368600000,
  });
  const safetyItem = await upsertWebhookInboxItem(
    staleSheets,
    safetyPayload,
    parseJsonTradingViewAlert(safetyPayload),
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  );
  let safetyBridgeCalls = 0;
  const safetyResult = await processWebhookInboxItem(safetyItem, {
    sheets: staleSheets,
    forwardToBridge: async () => { safetyBridgeCalls++; return { forwarded: true }; },
  });
  assert.strictEqual(safetyResult.status, 'COMPLETE');
  assert.strictEqual(safetyBridgeCalls, 1);

  // A payload emission timestamp takes precedence over a fresh Inbox receipt.
  const lateSignalPayload = edgePayload(
    'SETUP',
    'VIXALE_EDGE:LATE:15:LONG:1786370700000',
    {
      symbol: 'LATE', timeframe: '15', flip_bar_time: 1786370700000,
      alert_timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }
  );
  const lateSignalItem = await upsertWebhookInboxItem(
    staleSheets,
    lateSignalPayload,
    parseJsonTradingViewAlert(lateSignalPayload),
    new Date().toISOString()
  );
  let lateSignalBridgeCalls = 0;
  const lateSignalResult = await processWebhookInboxItem(lateSignalItem, {
    sheets: staleSheets,
    forwardToBridge: async () => { lateSignalBridgeCalls++; return { forwarded: true }; },
  });
  assert.strictEqual(lateSignalResult.status, 'STALE_EXECUTION_DROPPED');
  assert.strictEqual(lateSignalBridgeCalls, 0);

  // A post-side-effect COMPLETE-write failure retries without a second broker
  // execution. The bridge request may repeat, but setup identity is idempotent.
  const completionSheets = createMockSheets();
  const completionPayload = edgePayload(
    'SETUP',
    'VIXALE_EDGE:COMPLETEFAIL:15:LONG:1786370800000',
    {
      symbol: 'COMPLETEFAIL', timeframe: '15', flip_bar_time: 1786370800000,
      alert_timestamp: new Date().toISOString(),
    }
  );
  const completionItem = await upsertWebhookInboxItem(
    completionSheets,
    completionPayload,
    parseJsonTradingViewAlert(completionPayload),
    new Date().toISOString()
  );
  completionSheets.controls.fail_webhook_complete_update = 1;
  let completionBridgeRequests = 0;
  let completionBrokerExecutions = 0;
  let completionTelegramCalls = 0;
  const acceptedSetups = new Set();
  const completionDependencies = {
    sheets: completionSheets,
    sendTelegram: async () => { completionTelegramCalls++; return { ok: true }; },
    forwardToBridge: async raw => {
      completionBridgeRequests++;
      if (!acceptedSetups.has(raw.setup_id)) {
        acceptedSetups.add(raw.setup_id);
        completionBrokerExecutions++;
      }
      return { forwarded: true };
    },
  };
  const completionRetry = await processWebhookInboxItem(
    completionItem,
    completionDependencies
  );
  assert.strictEqual(completionRetry.status, 'RETRY');
  const completionDone = await processWebhookInboxItem(
    completionRetry,
    completionDependencies
  );
  assert.strictEqual(completionDone.status, 'COMPLETE');
  assert.strictEqual(completionBridgeRequests, 2);
  assert.strictEqual(completionBrokerExecutions, 1);
  assert.strictEqual(completionTelegramCalls, 0);
  assert.strictEqual(completionSheets.rows.Pending.length - 1, 0);
  assert.strictEqual(completionSheets.rows['Open Positions'].length - 1, 0);
  assert.strictEqual(completionSheets.rows['Closed Trades'].length - 1, 0);
  assert.strictEqual(completionSheets.rows.Trades.length - 1, 0);

  const pendingCompletionSheets = createMockSheets();
  const pendingCompletionPayload = edgePayload(
    'PENDING_SETUP',
    'VIXALE_EDGE:PENDINGCOMPLETE:15:LONG:1786370900000',
    {
      symbol: 'PENDINGCOMPLETE', timeframe: '15',
      flip_bar_time: 1786370900000,
    }
  );
  const pendingCompletionItem = await upsertWebhookInboxItem(
    pendingCompletionSheets,
    pendingCompletionPayload,
    parseJsonTradingViewAlert(pendingCompletionPayload),
    new Date().toISOString()
  );
  pendingCompletionSheets.controls.fail_webhook_complete_update = 1;
  let pendingCompletionTelegram = 0;
  let pendingCompletionBridge = 0;
  const pendingCompletionDependencies = {
    sheets: pendingCompletionSheets,
    sendTelegram: async () => { pendingCompletionTelegram++; return { ok: true }; },
    forwardToBridge: async (raw, row) => {
      if (shouldForwardToBridge(raw, row).ok) {
        pendingCompletionBridge++;
        return { forwarded: true };
      }
      return { forwarded: false, skipped: true };
    },
  };
  const pendingCompletionRetry = await processWebhookInboxItem(
    pendingCompletionItem,
    pendingCompletionDependencies
  );
  assert.strictEqual(pendingCompletionRetry.status, 'RETRY');
  const pendingCompletionDone = await processWebhookInboxItem(
    pendingCompletionRetry,
    pendingCompletionDependencies
  );
  assert.strictEqual(pendingCompletionDone.status, 'COMPLETE');
  assert.strictEqual(pendingCompletionSheets.rows.Pending.length - 1, 1);
  assert.strictEqual(pendingCompletionSheets.rows['Open Positions'].length - 1, 0);
  assert.strictEqual(pendingCompletionSheets.rows['Closed Trades'].length - 1, 0);
  assert.strictEqual(pendingCompletionSheets.rows.Trades.length - 1, 0);
  assert.strictEqual(pendingCompletionTelegram, 0);
  assert.strictEqual(pendingCompletionBridge, 0);

  // Recovery uses at most four simultaneous workers; one poison item retries
  // without preventing the other due items from completing.
  const backlogSheets = createMockSheets();
  for (let index = 0; index < 9; index++) {
    const payload = edgePayload(
      'SETUP',
      `VIXALE_EDGE:BACKLOG${index}:15:LONG:${1786371000000 + index}`,
      {
        symbol: `BACKLOG${index}`,
        timeframe: '15',
        flip_bar_time: 1786371000000 + index,
        alert_timestamp: new Date().toISOString(),
      }
    );
    await upsertWebhookInboxItem(
      backlogSheets,
      payload,
      parseJsonTradingViewAlert(payload),
      new Date().toISOString()
    );
  }
  let activeBacklog = 0;
  let maxActiveBacklog = 0;
  const backlogResult = await processWebhookInboxDueItems({
    sheets: backlogSheets,
    forwardToBridge: async raw => {
      activeBacklog++;
      maxActiveBacklog = Math.max(maxActiveBacklog, activeBacklog);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeBacklog--;
      return raw.symbol === 'BACKLOG0'
        ? { forwarded: false, error: 'mock poison callback' }
        : { forwarded: true };
    },
  });
  assert.strictEqual(backlogResult.processed, 9);
  assert.ok(maxActiveBacklog > 1, 'recovery is not globally serial');
  assert.ok(maxActiveBacklog <= 4, `max concurrency was ${maxActiveBacklog}`);
  const backlogStatuses = backlogSheets.rows['Webhook Inbox'].slice(1).map(row => row[7]);
  assert.strictEqual(backlogStatuses.filter(status => status === 'COMPLETE').length, 8);
  assert.strictEqual(backlogStatuses.filter(status => status === 'RETRY').length, 1);

  // A close that beats ENTRY_FILL remains retryable. Once the real Open state
  // appears, the same callback publishes one close and one Telegram message.
  const orphanSheets = createMockSheets();
  const orphanTelegram = [];
  const orphanSetupId = 'VIXALE_EDGE:ORPHAN:15:LONG:1786368600000';
  const orphanClosePayload = edgePayload('TP', orphanSetupId, {
    source: 'IB_BRIDGE', symbol: 'ORPHAN', timeframe: '15',
    price: 101.25, qty: 5, broker_confirmed_flat: true,
    position_after_close: 0, exit_execution_id: 'EXEC:ORPHAN-1',
    reconciliation_id: `${orphanSetupId}:EXEC:ORPHAN-1`,
    bridge_delivery_id: 'TP:ORPHAN:test-terminal', ib_target_status: 'Filled',
  });
  const orphanResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: orphanClosePayload },
    orphanResponse,
    {
      sheets: orphanSheets,
      sendTelegram: async message => { orphanTelegram.push(message); return { ok: true }; },
      forwardToBridge: async () => ({ forwarded: false, skipped: true }),
    }
  );
  assert.strictEqual(orphanResponse.statusCode, 503);
  assert.strictEqual(orphanSheets.rows.Trades.length - 1, 0);
  assert.strictEqual(orphanSheets.rows['Closed Trades'].length - 1, 0);
  assert.strictEqual(orphanTelegram.length, 0);

  const orphanLifecycle = createLifecycleContext({
    sheetStore: orphanSheets,
    telegramStore: orphanTelegram,
    bridgeStore: [],
  });
  await orphanLifecycle(edgePayload('ENTRY_FILL', orphanSetupId, {
    source: 'IB_BRIDGE', symbol: 'ORPHAN', timeframe: '15', qty: 5,
    entry: 100, target: 101.25, price: 100,
    render_forwarded_at: '2026-08-10T10:00:00-04:00',
    ib_status: 'FILLED', entry_filled: true, entry_fill_price: 100,
  }));
  const recoveredCloseResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: orphanClosePayload },
    recoveredCloseResponse,
    {
      sheets: orphanSheets,
      sendTelegram: async message => { orphanTelegram.push(message); return { ok: true }; },
      forwardToBridge: async () => ({ forwarded: false, skipped: true }),
    }
  );
  assert.strictEqual(recoveredCloseResponse.statusCode, 200);
  const duplicateRecoveredCloseResponse = createMockResponse();
  await handleTradingViewWebhookWithDependencies(
    { body: orphanClosePayload },
    duplicateRecoveredCloseResponse,
    {
      sheets: orphanSheets,
      sendTelegram: async message => { orphanTelegram.push(message); return { ok: true }; },
      forwardToBridge: async () => ({ forwarded: false, skipped: true }),
    }
  );
  assert.strictEqual(duplicateRecoveredCloseResponse.statusCode, 200);
  assert.strictEqual(orphanSheets.rows.Trades.length - 1, 2);
  assert.strictEqual(orphanSheets.rows['Closed Trades'].length - 1, 1);
  assert.strictEqual(
    orphanTelegram.filter(message => message.includes('Vixale Edge hit target')).length,
    1
  );

  // Prime uses the same durable manual-close publication contract and actual execution values.
  const primeSheets = createMockSheets();
  const primeTelegram = [];
  const primeLifecycle = createLifecycleContext({
    sheetStore: primeSheets,
    telegramStore: primeTelegram,
    bridgeStore: [],
  });
  const primeSetupId = 'VIXALE_PRIME:RTX:15:LONG:1786368600000';
  const primeBase = {
    source: 'TradingView', system_id: 'VIXALE_PRIME', strategy: 'SHREK_1_4',
    variant: 'ATR_LIMIT_OPPOSITE_FLIP', setup_id: primeSetupId,
    symbol: 'RTX', side: 'LONG', entry: 150, target: 152, stop: 0,
    qty: 5, timeframe: '15', flip_bar_time: 1786368600000,
  };
  await primeLifecycle({
    ...primeBase, event: 'ENTRY_FILL', source: 'IB_BRIDGE',
    render_forwarded_at: '2026-08-10T10:00:00-04:00',
    ib_status: 'FILLED', entry_filled: true,
  });
  const primeManual = {
    ...primeBase, event: 'EXTERNAL_CLOSE', source: 'IB_BRIDGE',
    render_forwarded_at: '2026-08-10T10:30:00-04:00',
    ib_status: 'position_flat_execution_reconciled', price: 151.37, qty: 5,
    broker_confirmed_flat: true, position_after_close: 0,
    exit_execution_id: 'EXEC:PRIME-MANUAL-RTX-1',
    reconciliation_id: `${primeSetupId}:EXEC:PRIME-MANUAL-RTX-1`,
    bridge_delivery_id: 'EXTERNAL_CLOSE:RTX:test-prime-manual',
    exit_price_available: true, exit_quantity_available: true,
  };
  const firstPrimeManual = await primeLifecycle(primeManual);
  const duplicatePrimeManual = await primeLifecycle(primeManual);
  assert.strictEqual(firstPrimeManual.finalRow.status, 'external_close_publication_complete');
  assert.strictEqual(duplicatePrimeManual.finalRow.status, 'ignored_duplicate_external_close');
  assert.strictEqual(primeSheets.rows.Trades.length - 1, 2, 'Prime has one fill and one manual close');
  assert.strictEqual(primeSheets.rows['Closed Trades'].length - 1, 1);
  assert.strictEqual(primeSheets.rows['Closed Trades'][1][6], 151.37);
  assert.strictEqual(
    primeTelegram.filter(message => message.includes('Vixale Prime closed manually')).length,
    1
  );
  const unrelatedPrimeSetupId = 'VIXALE_PRIME:RTX:15:LONG:1786372200000';
  primeSheets.rows['Open Positions'].push([
    'RTX_LONG', '2026-08-10T10:31:00-04:00', 'RTX', 'LONG', 'open',
    151.5, 5, 153, 0, '', '', JSON.stringify({
      ...primeBase,
      setup_id: unrelatedPrimeSetupId,
      flip_bar_time: 1786372200000,
    }),
  ]);
  const stalePrimeTargetAfterManual = await primeLifecycle({
    ...primeBase, event: 'TP', source: 'IB_BRIDGE',
    render_forwarded_at: '2026-08-10T10:31:00-04:00',
    ib_status: 'position_flat_target_reconcile', ib_target_status: 'Filled',
    price: 152, qty: 5, broker_confirmed_flat: true, position_after_close: 0,
    exit_execution_id: 'EXEC:STALE-PRIME-TARGET-RTX-1',
    reconciliation_id: `${primeSetupId}:EXEC:STALE-PRIME-TARGET-RTX-1`,
    bridge_delivery_id: 'TP:RTX:test-stale-after-manual',
  });
  assert.strictEqual(
    stalePrimeTargetAfterManual.finalRow.status,
    'terminal_orphan_already_removed_broker_exit'
  );
  assert.strictEqual(primeSheets.rows['Closed Trades'].length - 1, 1);
  assert.strictEqual(primeSheets.rows['Open Positions'].length - 1, 1);
  assert.strictEqual(
    JSON.parse(primeSheets.rows['Open Positions'][1][11]).setup_id,
    unrelatedPrimeSetupId,
    'stale prior-setup target must not remove a newer same-symbol Open row'
  );
  assert.strictEqual(primeTelegram.length, 2, 'one Prime open and one manual close only');

  // A Prime target callback also completes through Trade Metadata and stays idempotent.
  const primeTargetSheets = createMockSheets();
  const primeTargetTelegram = [];
  const primeTargetLifecycle = createLifecycleContext({
    sheetStore: primeTargetSheets,
    telegramStore: primeTargetTelegram,
    bridgeStore: [],
  });
  const primeTargetSetupId = 'VIXALE_PRIME:CSCO:15:LONG:1786371300000';
  const primeTargetBase = {
    source: 'TradingView', system_id: 'VIXALE_PRIME', strategy: 'SHREK_1_4',
    variant: 'ATR_LIMIT_OPPOSITE_FLIP', setup_id: primeTargetSetupId,
    symbol: 'CSCO', side: 'LONG', entry: 70, target: 71.25, stop: 0,
    qty: 8, timeframe: '15', flip_bar_time: 1786371300000,
  };
  await primeTargetLifecycle({
    ...primeTargetBase, event: 'ENTRY_FILL', source: 'IB_BRIDGE',
    render_forwarded_at: '2026-08-10T11:00:00-04:00',
    ib_status: 'FILLED', entry_filled: true,
  });
  const primeTarget = {
    ...primeTargetBase, event: 'TP', source: 'IB_BRIDGE',
    render_forwarded_at: '2026-08-10T11:30:00-04:00',
    ib_status: 'position_flat_target_reconcile', ib_target_status: 'Filled',
    price: 71.31, qty: 8, broker_confirmed_flat: true, position_after_close: 0,
    exit_execution_id: 'EXEC:PRIME-TARGET-CSCO-1',
    reconciliation_id: `${primeTargetSetupId}:EXEC:PRIME-TARGET-CSCO-1`,
    bridge_delivery_id: 'TP:CSCO:test-prime-target',
  };
  const firstPrimeTarget = await primeTargetLifecycle(primeTarget);
  const duplicatePrimeTarget = await primeTargetLifecycle(primeTarget);
  assert.strictEqual(firstPrimeTarget.finalRow.status, 'bridge_close_publication_complete');
  assert.strictEqual(duplicatePrimeTarget.finalRow.status, 'ignored_duplicate_bridge_close');
  assert.strictEqual(primeTargetSheets.rows['Closed Trades'].length - 1, 1);
  assert.strictEqual(primeTargetSheets.rows['Trade Metadata'].length - 1, 1);
  assert.strictEqual(primeTargetSheets.rows['Trade Metadata'][1][23], true);
  assert.strictEqual(
    primeTargetTelegram.filter(message => message.includes('Vixale Prime hit target')).length,
    1
  );

  console.log('Vixale Edge app lifecycle integration: mocked Sheets, Telegram, and bridge checks passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
