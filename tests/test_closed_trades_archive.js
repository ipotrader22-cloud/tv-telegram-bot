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
  cleanNumber,
  closedTradeTimestampKey,
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

assert.strictEqual(cleanNumber("   "), "", "whitespace-only numeric cells must remain missing");
assert.strictEqual(cleanNumber("0"), 0, "a legitimate numeric zero must remain zero");
assert(closedTradeTimestampKey("2026-09-09 12:12:06") > closedTradeTimestampKey("2026-09-09 9:45:09"));

const sameDaySort = buildClosedTradesArchive([
  closedValues[0],
  ["MORNING", "", "2026-09-09 9:45:09", "AAA", "LONG", "10", "11", "1", "1", "TARGET"],
  ["NOON", "", "2026-09-09 12:12:06", "BBB", "SHORT", "10", "9", "1", "1", "TARGET"],
]);
assert.strictEqual(sameDaySort.trades[0].symbol, "BBB", "later same-day close must sort before an earlier unpadded hour");
assert.strictEqual(sameDaySort.trades[1].symbol, "AAA");

const missingAndZero = buildClosedTradesArchive([
  closedValues[0],
  ["BLANK", "", "2026-09-09 10:00:00", "BLANK", "LONG", "   ", " ", " ", "   ", "MANUAL_CLOSE"],
  ["ZERO", "", "2026-09-09 11:00:00", "ZERO", "LONG", "0", "0", "0", "0", "EOD_CLOSE"],
  ["WIN", "", "2026-09-09 12:00:00", "WIN", "LONG", "10", "11", "1", "1", "TARGET"],
]);
const blankTrade = missingAndZero.trades.find(trade => trade.symbol === "BLANK");
const zeroTrade = missingAndZero.trades.find(trade => trade.symbol === "ZERO");
assert.strictEqual(blankTrade.entry, null);
assert.strictEqual(blankTrade.exit, null);
assert.strictEqual(blankTrade.size, null);
assert.strictEqual(blankTrade.result, null, "blank P&L must not become a fabricated zero");
assert.strictEqual(zeroTrade.entry, 0);
assert.strictEqual(zeroTrade.exit, 0);
assert.strictEqual(zeroTrade.size, 0);
assert.strictEqual(zeroTrade.result, 0, "legitimate zero P&L must remain eligible numeric data");
assert.strictEqual(missingAndZero.summary.total_trades, 3);
assert.strictEqual(missingAndZero.summary.total_realized_pnl, 1);
assert.strictEqual(missingAndZero.summary.win_rate, 50, "win-rate denominator must include numeric zero but exclude missing P&L");

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
assert(markup.includes("Take Profit"));
assert(markup.includes("Stop Loss"));
assert(markup.includes("End-of-Day Close"));
assert(!markup.includes(">Close Stop<"));
assert(!markup.includes(">EOD Close<"));

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
