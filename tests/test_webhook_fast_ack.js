'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const TEST_SPOOL = path.join(
  os.tmpdir(),
  `vixale_webhook_fast_ack_${process.pid}.json`
);
try { fs.unlinkSync(TEST_SPOOL); } catch (_) {}

process.env.WEBHOOK_INBOX_SPOOL_FILE = TEST_SPOOL;
process.env.BRIDGE_URL = 'http://mock-bridge.test';
process.env.BRIDGE_FORWARD_ENABLED = 'true';
process.env.BRIDGE_DRY_RUN = 'true';

function fakeExpress() {
  return {
    set() {},
    use() {},
    get() {},
    post() {},
    listen() {
      throw new Error('app.listen must not run in test');
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
  handleTradingViewWebhookWithDependencies,
  webhookInboundDeliveryId,
  spoolWebhookInboxItem,
  migrateWebhookInboxSpool,
} = require('../app.js').__test;
Module._load = originalLoad;

function payload(symbol, barTime) {
  return {
    source: 'TradingView',
    payload_version: 2,
    system_id: 'VIXALE_EDGE',
    setup_id: `VIXALE_EDGE:${symbol}:5:LONG:${barTime}`,
    alert_instance_id: `FIONA_${symbol}_5`,
    strategy: 'VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1',
    variant: 'FIONA_LIMIT_PULLBACK_ATR_TARGET',
    event: 'PENDING_SETUP',
    sec_type: 'STK',
    asset_class: 'STOCK',
    symbol,
    exchange: 'SMART',
    currency: 'USD',
    side: 'LONG',
    entry: 100,
    price: 100,
    target: 101,
    target_tif: 'GTC',
    stop: 99,
    qty: 10,
    timeframe: '5',
    flip_bar_time: barTime,
    eod_policy: 'NO_EOD_CLOSE',
  };
}

function responseRecorder(order = []) {
  return {
    headersSent: false,
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.headersSent = true;
      this.body = body;
      order.push('ack');
      return this;
    },
  };
}

function webhookSheets() {
  const rows = [
    ['Delivery ID', 'Received At', 'Event', 'System ID', 'Setup ID', 'Symbol',
      'Side', 'Status', 'Attempts', 'Next Attempt At', 'Last Error', 'Raw JSON',
      'Completed At'],
  ];
  const spreadsheets = {
    async get() {
      return {
        data: {
          sheets: [{ properties: { title: 'Webhook Inbox', sheetId: 1 } }],
        },
      };
    },
    values: {
      async get({ range }) {
        assert.strictEqual(range, 'Webhook Inbox!A:M');
        return { data: { values: rows.map(row => [...row]) } };
      },
      async append({ range, requestBody }) {
        assert.strictEqual(range, 'Webhook Inbox!A:M');
        for (const row of requestBody.values) rows.push([...row]);
        const rowNumber = rows.length;
        return {
          data: {
            updates: {
              updatedRange: `Webhook Inbox!A${rowNumber}:M${rowNumber}`,
            },
          },
        };
      },
    },
  };
  return { spreadsheets, rows };
}

async function run() {
  try { fs.unlinkSync(TEST_SPOOL); } catch (_) {}

  const snow = payload('SNOW', 1791293400000);
  const snowId = webhookInboundDeliveryId(snow, parseJsonTradingViewAlert(snow));
  const order = [];
  let scheduledWork = null;
  let sheetsClientCalls = 0;
  const res = responseRecorder(order);
  const started = Date.now();

  await handleTradingViewWebhookWithDependencies(
    { body: snow, headers: { 'content-type': 'application/json' } },
    res,
    {
      getSheetsClient: async () => {
        sheetsClientCalls++;
        await new Promise(resolve => setTimeout(resolve, 3500));
        throw new Error('Sheets should not be awaited before ACK');
      },
      scheduleWebhookInboxWork: work => {
        order.push('scheduled');
        scheduledWork = work;
      },
    }
  );

  const ackMs = Date.now() - started;
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body, 'OK');
  assert.ok(ackMs < 500, `ACK took ${ackMs}ms`);
  assert.deepStrictEqual(order, ['ack', 'scheduled']);
  assert.strictEqual(sheetsClientCalls, 0, 'ACK path never waits for Sheets');
  assert.strictEqual(typeof scheduledWork, 'function');

  const spooled = JSON.parse(fs.readFileSync(TEST_SPOOL, 'utf8'));
  assert.ok(spooled[snowId], 'recognized delivery is durably spooled before ACK');
  assert.strictEqual(Object.keys(spooled).length, 1);

  const slowSheets = webhookSheets();
  const slowGet = slowSheets.spreadsheets.values.get;
  let slowReads = 0;
  slowSheets.spreadsheets.values.get = async params => {
    if (slowReads++ === 0) {
      await new Promise(resolve => setTimeout(resolve, 3500));
    }
    return slowGet(params);
  };
  const migrationStarted = Date.now();
  assert.strictEqual(await migrateWebhookInboxSpool(slowSheets), 1);
  assert.ok(Date.now() - migrationStarted >= 3400);
  assert.strictEqual(slowSheets.rows.length - 1, 1);
  assert.strictEqual(slowSheets.rows[1][0], snowId);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(TEST_SPOOL, 'utf8')), {});

  const failedRes = responseRecorder();
  let failedScheduled = false;
  await handleTradingViewWebhookWithDependencies(
    { body: payload('DAL', 1791293400001), headers: { 'content-type': 'application/json' } },
    failedRes,
    {
      spoolWebhookInboxItem: () => false,
      scheduleWebhookInboxWork: () => { failedScheduled = true; },
    }
  );
  assert.strictEqual(failedRes.statusCode, 503);
  assert.strictEqual(failedRes.body, 'RETRY');
  assert.strictEqual(failedScheduled, false);

  try { fs.unlinkSync(TEST_SPOOL); } catch (_) {}
  const raceSheets = webhookSheets();
  const raceGet = raceSheets.spreadsheets.values.get;
  let delayFirstRead = true;
  let releaseRead;
  let markReadStarted;
  const readStarted = new Promise(resolve => { markReadStarted = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  raceSheets.spreadsheets.values.get = async params => {
    if (delayFirstRead) {
      delayFirstRead = false;
      markReadStarted();
      await readGate;
    }
    return raceGet(params);
  };

  const a = payload('RACEA', 1791293400010);
  const b = payload('RACEB', 1791293400020);
  assert.strictEqual(spoolWebhookInboxItem(a, parseJsonTradingViewAlert(a)), true);
  const firstMigration = migrateWebhookInboxSpool(raceSheets);
  await readStarted;
  assert.strictEqual(spoolWebhookInboxItem(b, parseJsonTradingViewAlert(b)), true);
  releaseRead();

  assert.strictEqual(await firstMigration, 1);
  const remaining = JSON.parse(fs.readFileSync(TEST_SPOOL, 'utf8'));
  assert.strictEqual(Object.keys(remaining).length, 1);
  assert.ok(remaining[webhookInboundDeliveryId(b, parseJsonTradingViewAlert(b))]);

  assert.strictEqual(await migrateWebhookInboxSpool(raceSheets), 1);
  assert.strictEqual(raceSheets.rows.length - 1, 2);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(TEST_SPOOL, 'utf8')), {});

  console.log('Webhook fast-ACK durability regression passed');
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try { fs.unlinkSync(TEST_SPOOL); } catch (_) {}
  });
