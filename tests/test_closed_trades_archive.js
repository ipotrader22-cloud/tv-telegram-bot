"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function loadWithGoogleStub(request, parent, isMain) {
  if (request === "googleapis") {
    return { google: { auth: { GoogleAuth: class GoogleAuth {} }, sheets: () => ({}) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  ARCHIVE_PATH,
  buildClosedTradesArchive,
  getClosedTradesArchiveSnapshot,
  refineGlobalArchiveLinks,
  archiveContent,
  refineClosedTradesArchivePage,
} = require("../website_closed_trades_archive");
Module._load = originalLoad;

const closedValues = [
  ["Trade ID", "Open Time", "Close Time", "Symbol", "Side", "Entry", "Exit", "Size", "Result", "Event"],
  ["A", "2026-09-04 09:40:00", "2026-09-04 10:10:00", "NVDA", "LONG", "120.25", "122.00", "10", "+17.50", "TARGET"],
  ["B", "2026-09-03 11:00:00", "2026-09-03 13:20:00", "NFLX", "SHORT", "650", "652", "2", "-4", "CLOSE_STOP"],
  ["", "", "2026-09-02 15:59:00", "META", "LONG", "500", "501.50", "1", "1.50", "EOD_CLOSE"],
];

const built = buildClosedTradesArchive(closedValues, new Date("2026-09-04T16:00:00-04:00"));
assert.strictEqual(built.summary.total_trades, 3);
assert.strictEqual(built.summary.total_realized_pnl, 15);
assert.strictEqual(built.summary.win_rate, 66.67);
assert.strictEqual(built.summary.first_close_date, "2026-09-02");
assert.strictEqual(built.summary.last_close_date, "2026-09-04");
assert.strictEqual(built.trades[0].symbol, "NVDA");
assert.strictEqual(built.trades[2].symbol, "META", "archive must not require Trade ID / column A");

const serialized = JSON.stringify(built);
assert(!serialized.includes('"trade_id"'));
assert(!serialized.includes("Raw JSON"));
assert(serialized.includes("NVDA"));
assert(serialized.includes("CLOSE_STOP"));

const linked = refineGlobalArchiveLinks(`
<nav><a href="#live">Live System</a><a href="/trading-systems">Trading Systems</a></nav>
<div class="vx-home-equity-foot"><span id="vx-home-equity-status">Verified · Closed Trades ledger</span><a href="/pricing">View performance details</a></div>
`);
assert(linked.includes('<a href="/">Home</a>'));
assert(!linked.includes('>Live System</a>'));
assert(linked.includes(`href="${ARCHIVE_PATH}">Closed Trades ledger</a>`));

const pageShell = `<!doctype html><html><head><title>Vixale</title><link rel="canonical" href="https://www.vixale.com/"></head><body><nav><a href="#live">Live System</a></nav><main><section>old homepage body</section></main><footer>Risk disclosure</footer></body></html>`;
const page = refineClosedTradesArchivePage(pageShell, { ...built, stale: false });
assert(page.includes("<title>Vixale | Closed Trades Archive</title>"));
assert(page.includes('href="https://www.vixale.com/closed-trades"'));
assert(page.includes("Closed Trades Archive"));
assert(page.includes("Trade history"));
assert(page.includes("NVDA"));
assert(page.includes("NFLX"));
assert(page.includes("META"));
assert(page.includes("Realized P&amp;L"));
assert(page.includes("Refresh data"));
assert(page.includes("Risk disclosure"));
assert(!page.includes("old homepage body"));
assert(!page.includes("Trade ID"));

const markup = archiveContent({ ...built, stale: false });
assert(markup.includes('data-outcome="win"'));
assert(markup.includes('data-outcome="loss"'));
assert(markup.includes("EOD Close"));

const missingMarkup = archiveContent({
  stale: false,
  summary: { total_trades: 1, total_realized_pnl: 0, win_rate: 0, first_close_date: "2026-09-01", last_close_date: "2026-09-01" },
  trades: [{ close_time: "2026-09-01 10:00:00", symbol: "SPY", side: "LONG", entry: null, exit: null, size: null, result: null, event: "MANUAL_CLOSE" }],
});
assert(missingMarkup.includes('<td>—</td>\n      <td>—</td>\n      <td>—</td>\n      <td><span class="vx-pnl neutral">—</span></td>'));

(async () => {
  const cache = { loadedAt: 0, payload: null };
  const fresh = await getClosedTradesArchiveSnapshot({
    cache,
    now: new Date("2026-09-04T16:00:00-04:00"),
    nowMs: 1_000_000,
    readClosedTradesArchive: async () => closedValues,
  });
  assert.strictEqual(fresh.stale, false);
  assert.strictEqual(fresh.trades.length, 3);

  const stale = await getClosedTradesArchiveSnapshot({
    cache,
    now: new Date("2026-09-04T17:30:00-04:00"),
    nowMs: 1_061_000,
    readClosedTradesArchive: async () => { throw new Error("temporary failure"); },
  });
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.trades.length, 3);

  console.log("Closed Trades archive + Home nav contract: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
