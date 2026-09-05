"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function loadWithGoogleStub(request, parent, isMain) {
  if (request === "googleapis") {
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
  buildPublicPerformance,
  getPublicPerformanceSnapshot,
  handlePublicPerformanceRequest,
  wrapExpress,
} = require("../website_public_performance");
Module._load = originalLoad;

function fakeExpress() {
  return {
    routes: [],
    get(path, handler) { this.routes.push({ path, handler }); },
  };
}

const wrappedExpress = wrapExpress(fakeExpress);
const wrappedApp = wrappedExpress();
assert(wrappedApp.routes.some(route => route.path === "/public-performance.json"));

const values = [
  ["Trade ID", "Open Time", "Close Time", "Symbol", "Side", "Entry", "Exit", "Size", "Result"],
  ["A", "", "2026-09-04 10:00:00", "NVDA", "LONG", "", "", "", "$100.25"],
  ["B", "", "2026-09-04T14:00:00", "NFLX", "SHORT", "", "", "", "-25.50"],
  ["C", "", "09/03/2026 12:30:00", "META", "LONG", "", "", "", "+50"],
  ["", "", "2026-09-04 15:00:00", "SHOULD_SKIP", "", "", "", "", "999"],
  ["D", "", "bad-date", "QQQ", "", "", "", "", "5"],
  ["E", "", "2026-09-04 15:30:00", "QQQ", "", "", "", "", "not-a-number"],
];

const built = buildPublicPerformance(values, new Date("2026-09-04T16:00:00-04:00"));
assert.deepStrictEqual(built.summary, {
  closed_count_today: 3,
  closed_pnl_today: 74.75,
  total_closed_pnl: 129.75,
  win_rate: 75,
});
assert.deepStrictEqual(built.equity_curve, {
  points: [
    { date: "2026-09-03", daily_pnl: 50, cumulative_pnl: 50 },
    { date: "2026-09-04", daily_pnl: 74.75, cumulative_pnl: 124.75 },
  ],
  total_realized_pnl: 124.75,
});

const serialized = JSON.stringify(built);
for (const privateField of ["NVDA", "NFLX", "META", "QQQ", "trade_id", "symbol", "entry", "exit", "side"]) {
  assert(!serialized.includes(privateField), `public performance payload must not expose ${privateField}`);
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(headers) { Object.assign(this.headers, headers); return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  const cache = { loadedAt: 0, payload: null };
  const fresh = await getPublicPerformanceSnapshot({
    cache,
    now: new Date("2026-09-04T16:00:00-04:00"),
    nowMs: 1_000_000,
    readClosedTrades: async () => values,
  });
  assert.strictEqual(fresh.stale, false);

  const stale = await getPublicPerformanceSnapshot({
    cache,
    now: new Date("2026-09-04T17:30:00-04:00"),
    nowMs: 1_000_000 + 61_000,
    readClosedTrades: async () => { throw new Error("temporary sheets failure"); },
  });
  assert.strictEqual(stale.stale, true);
  assert.deepStrictEqual(stale.summary, fresh.summary);

  const response = responseRecorder();
  await handlePublicPerformanceRequest({}, response, {
    cache: { loadedAt: 0, payload: null },
    now: new Date("2026-09-04T16:00:00-04:00"),
    nowMs: 2_000_000,
    readClosedTrades: async () => values,
  });
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.ok, true);
  assert.match(response.headers["Cache-Control"], /no-store/);

  const unavailable = responseRecorder();
  await handlePublicPerformanceRequest({}, unavailable, {
    cache: { loadedAt: 0, payload: null },
    readClosedTrades: async () => { throw new Error("down"); },
  });
  assert.strictEqual(unavailable.statusCode, 503);
  assert.deepStrictEqual(unavailable.body, { ok: false, error: "performance_unavailable" });

  console.log("Public performance preview contract: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
