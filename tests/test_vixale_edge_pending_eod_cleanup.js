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

const {
  cleanupStaleVixaleEdgePendingRows,
  runEdgePendingEodCleanup,
  isCompletedEdgePendingSession,
  processLedger,
} = require('../app.js').__test;
Module._load = originalLoad;

function edgePending(setupId, flipBarTime, symbol = 'AAPL') {
  const raw = {
    source: 'TradingView',
    payload_version: 2,
    system_id: 'VIXALE_EDGE',
    strategy: 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1',
    variant: 'FIONA_LIMIT_PULLBACK_ATR_TARGET',
    event: 'PENDING_SETUP',
    setup_id: setupId,
    symbol,
    side: 'LONG',
  };
  if (flipBarTime !== undefined) raw.flip_bar_time = flipBarTime;
  return [
    setupId,
    'mutable row timestamp',
    symbol,
    'LONG',
    'pending',
    100,
    1,
    102,
    98,
    JSON.stringify(raw),
  ];
}

function primePending() {
  return [
    'MSFT_LONG',
    '2026-07-30 10:00:00',
    'MSFT',
    'LONG',
    'pending',
    400,
    1,
    405,
    395,
    JSON.stringify({
      system_id: 'VIXALE_PRIME',
      strategy: 'SHREK_1_4',
      event: 'PENDING_SETUP',
      flip_bar_time: Date.parse('2026-07-29T15:00:00-04:00'),
    }),
  ];
}

function createDeferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function createMockSheets(pendingRows, options = {}) {
  const rows = {
    Pending: [
      ['Trade ID', 'Timestamp', 'Symbol', 'Side', 'Status', 'Entry', 'Size', 'Target', 'Stop', 'Raw JSON'],
      ...pendingRows.map(row => [...row]),
    ],
    'Open Positions': [
      ['Trade ID'],
      ['EDGE_OPEN_1', '2026-07-29 11:00:00', 'NVDA', 'LONG'],
    ],
    'Closed Trades': [
      ['Trade ID'],
      ['EDGE_CLOSED_1', '2026-07-28 10:00:00', '2026-07-28 14:00:00'],
    ],
  };
  const sheetIds = { Pending: 1, 'Open Positions': 2, 'Closed Trades': 3 };
  const namesById = Object.fromEntries(
    Object.entries(sheetIds).map(([name, id]) => [id, name])
  );
  const calls = { reads: [], deletes: [], appends: [], updates: [] };
  const initialReadReached = createDeferred();
  const resumeInitialRead = createDeferred();
  let pauseInitialPendingRead = Boolean(options.pauseInitialPendingRead);

  const spreadsheets = {
    async get() {
      return {
        data: {
          sheets: Object.entries(sheetIds).map(([title, sheetId]) => ({
            properties: { title, sheetId },
          })),
        },
      };
    },
    async batchUpdate({ requestBody }) {
      for (const request of requestBody.requests || []) {
        const range = request.deleteDimension?.range;
        if (!range) continue;
        const sheetName = namesById[range.sheetId];
        calls.deletes.push({ sheetName, ...range });
        rows[sheetName].splice(
          range.startIndex,
          range.endIndex - range.startIndex
        );
      }
      return { data: {} };
    },
    values: {
      async get({ range }) {
        const sheetName = range.split('!')[0];
        calls.reads.push(sheetName);
        const snapshot = rows[sheetName].map(row => [...row]);
        if (sheetName === 'Pending' && pauseInitialPendingRead) {
          pauseInitialPendingRead = false;
          initialReadReached.resolve();
          await resumeInitialRead.promise;
        }
        return {
          data: {
            values: snapshot,
          },
        };
      },
      async append({ range, requestBody }) {
        const sheetName = range.split('!')[0];
        calls.appends.push(sheetName);
        for (const row of requestBody.values || []) {
          rows[sheetName].push([...row]);
        }
        return { data: {} };
      },
      async update({ range, requestBody }) {
        const [sheetName, cells] = range.split('!');
        const rowNumber = Number(cells.match(/\d+/)?.[0] || 0);
        calls.updates.push(sheetName);
        rows[sheetName][rowNumber - 1] = [...requestBody.values[0]];
        return { data: {} };
      },
    },
  };

  return {
    spreadsheets,
    rows,
    calls,
    initialReadReached: initialReadReached.promise,
    resumeInitialRead: resumeInitialRead.resolve,
  };
}

function edgeLifecycleRow(event, setupId, flipBarTime, symbol = 'AAPL') {
  const raw = {
    source: 'TradingView',
    payload_version: 2,
    system_id: 'VIXALE_EDGE',
    strategy: 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1',
    variant: 'FIONA_LIMIT_PULLBACK_ATR_TARGET',
    event,
    setup_id: setupId,
    flip_bar_time: flipBarTime,
    symbol,
    side: 'LONG',
    planned_limit_entry: 100,
    target: 102,
    stop: 98,
    qty: 1,
    cancel_scope: event === 'CANCEL' ? 'PENDING_ONLY' : '',
  };
  return {
    ...raw,
    trade_id: setupId,
    timestamp: '2026-07-30 15:30:00',
    entry: 100,
    size: 1,
    status: event === 'CANCEL' ? 'canceled' : 'pending',
    raw: JSON.stringify(raw),
  };
}

async function run() {
  const originalFetch = global.fetch;
  let networkRequests = 0;
  global.fetch = async () => {
    networkRequests++;
    throw new Error('cleanup must not call Telegram, bridge, or TWS');
  };

  try {
    const currentSetupId = 'VIXALE_EDGE:AAPL:60:LONG:1785448800000';
    const preCloseSheets = createMockSheets([
      edgePending(
        currentSetupId,
        Date.parse('2026-07-30T15:00:00-04:00')
      ),
      primePending(),
    ]);
    const preOpenSnapshot = structuredClone(preCloseSheets.rows['Open Positions']);
    const preClosedSnapshot = structuredClone(preCloseSheets.rows['Closed Trades']);

    assert.strictEqual(
      isCompletedEdgePendingSession(
        '2026-07-30',
        new Date('2026-07-30T15:59:59-04:00')
      ),
      false,
      'current New York session is not complete before 16:00'
    );
    const preCloseResult = await cleanupStaleVixaleEdgePendingRows({
      sheets: preCloseSheets,
      now: new Date('2026-07-30T15:59:59-04:00'),
    });
    assert.strictEqual(preCloseResult.removed, 0);
    assert.strictEqual(preCloseSheets.rows.Pending.length, 3);
    assert.deepStrictEqual(preCloseSheets.rows['Open Positions'], preOpenSnapshot);
    assert.deepStrictEqual(preCloseSheets.rows['Closed Trades'], preClosedSnapshot);

    const staleSetupId = 'VIXALE_EDGE:SBUX:15:SHORT:1785447000000';
    const afterCloseSheets = createMockSheets([
      edgePending(
        staleSetupId,
        Date.parse('2026-07-30T15:30:00-04:00'),
        'SBUX'
      ),
      primePending(),
    ]);
    const openSnapshot = structuredClone(afterCloseSheets.rows['Open Positions']);
    const closedSnapshot = structuredClone(afterCloseSheets.rows['Closed Trades']);

    const afterCloseResult = await runEdgePendingEodCleanup({
      sheets: afterCloseSheets,
      now: new Date('2026-07-30T16:01:00-04:00'),
    });
    assert.deepStrictEqual(afterCloseResult.removed_setup_ids, [staleSetupId]);
    assert.strictEqual(afterCloseSheets.rows.Pending.length, 2);
    assert.strictEqual(afterCloseSheets.rows.Pending[1][0], 'MSFT_LONG');
    assert.deepStrictEqual(afterCloseSheets.rows['Open Positions'], openSnapshot);
    assert.deepStrictEqual(afterCloseSheets.rows['Closed Trades'], closedSnapshot);
    assert.deepStrictEqual(
      [...new Set(afterCloseSheets.calls.reads)],
      ['Pending'],
      'cleanup reads only Pending'
    );
    assert(
      afterCloseSheets.calls.deletes.every(call => call.sheetName === 'Pending'),
      'cleanup deletes only Pending rows'
    );

    const repeatResult = await runEdgePendingEodCleanup({
      sheets: afterCloseSheets,
      now: new Date('2026-07-30T16:05:00-04:00'),
    });
    assert.strictEqual(repeatResult.removed, 0);
    assert.strictEqual(afterCloseSheets.rows.Pending.length, 2);

    const olderSetupId = 'VIXALE_EDGE:AMD:30:LONG:1785362400000';
    const newSessionSetupId = 'VIXALE_EDGE:TSLA:30:LONG:1785448800000';
    const restartSheets = createMockSheets([
      edgePending(
        olderSetupId,
        Date.parse('2026-07-29T15:00:00-04:00'),
        'AMD'
      ),
      edgePending(
        newSessionSetupId,
        Date.parse('2026-07-30T10:00:00-04:00'),
        'TSLA'
      ),
    ]);
    const catchUpResult = await runEdgePendingEodCleanup({
      sheets: restartSheets,
      now: new Date('2026-07-30T10:05:00-04:00'),
    });
    assert.deepStrictEqual(catchUpResult.removed_setup_ids, [olderSetupId]);
    assert.deepStrictEqual(
      restartSheets.rows.Pending.slice(1).map(row => row[0]),
      [newSessionSetupId],
      'startup/catch-up removes only the completed prior session'
    );

    const fallbackTimestamp = Date.parse('2026-07-29T15:00:00-04:00');
    const fallbackSetupId =
      `VIXALE_EDGE:QQQ:45:SHORT:${fallbackTimestamp}`;
    const fallbackSheets = createMockSheets([
      edgePending(fallbackSetupId, undefined, 'QQQ'),
    ]);
    const fallbackResult = await cleanupStaleVixaleEdgePendingRows({
      sheets: fallbackSheets,
      now: new Date('2026-07-30T10:10:00-04:00'),
    });
    assert.deepStrictEqual(
      fallbackResult.removed_setup_ids,
      [fallbackSetupId],
      'exact setup_id timestamp is used when raw flip_bar_time is missing'
    );

    const concurrentStaleId =
      `VIXALE_EDGE:SPY:15:LONG:${Date.parse('2026-07-29T15:45:00-04:00')}`;
    const concurrentCurrentId =
      `VIXALE_EDGE:IWM:15:LONG:${Date.parse('2026-07-30T10:00:00-04:00')}`;
    const concurrentlyAddedId =
      `VIXALE_EDGE:DIA:15:LONG:${Date.parse('2026-07-30T11:00:00-04:00')}`;
    const concurrentSheets = createMockSheets(
      [
        edgePending(
          concurrentStaleId,
          Date.parse('2026-07-29T15:45:00-04:00'),
          'SPY'
        ),
        primePending(),
        edgePending(
          concurrentCurrentId,
          Date.parse('2026-07-30T10:00:00-04:00'),
          'IWM'
        ),
      ],
      { pauseInitialPendingRead: true }
    );

    const cleanupPromise = cleanupStaleVixaleEdgePendingRows({
      sheets: concurrentSheets,
      now: new Date('2026-07-30T10:15:00-04:00'),
    });
    await concurrentSheets.initialReadReached;

    let cancelFinished = false;
    let upsertFinished = false;
    const cancelPromise = processLedger(
      edgeLifecycleRow(
        'CANCEL',
        concurrentStaleId,
        Date.parse('2026-07-29T15:45:00-04:00'),
        'SPY'
      ),
      { sheets: concurrentSheets }
    ).then(result => {
      cancelFinished = true;
      return result;
    });
    const upsertPromise = processLedger(
      edgeLifecycleRow(
        'PENDING_SETUP',
        concurrentlyAddedId,
        Date.parse('2026-07-30T11:00:00-04:00'),
        'DIA'
      ),
      { sheets: concurrentSheets }
    ).then(result => {
      upsertFinished = true;
      return result;
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(cancelFinished, false, 'exact CANCEL waits for cleanup lock');
    assert.strictEqual(upsertFinished, false, 'PENDING_SETUP upsert waits for cleanup lock');

    concurrentSheets.resumeInitialRead();
    const concurrentResults = await Promise.race([
      Promise.all([cleanupPromise, cancelPromise, upsertPromise]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pending mutation lock deadlocked')), 1000)
      ),
    ]);
    assert.strictEqual(concurrentResults[0].removed, 1);

    const survivingIds = concurrentSheets.rows.Pending
      .slice(1)
      .map(row => row[0]);
    assert.deepStrictEqual(
      survivingIds,
      ['MSFT_LONG', concurrentCurrentId, concurrentlyAddedId],
      'serialized row shifts preserve Prime, current-session Edge, and concurrent new Pending rows'
    );

    const repeatedConcurrentCleanup = await cleanupStaleVixaleEdgePendingRows({
      sheets: concurrentSheets,
      now: new Date('2026-07-30T10:16:00-04:00'),
    });
    assert.strictEqual(repeatedConcurrentCleanup.removed, 0);
    assert.deepStrictEqual(
      concurrentSheets.rows.Pending.slice(1).map(row => row[0]),
      survivingIds,
      'repeated serialized cleanup remains idempotent'
    );

    assert.strictEqual(networkRequests, 0, 'cleanup makes no Telegram or bridge/TWS request');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('Vixale Edge server EOD Pending cleanup: focused checks passed');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
