"use strict";

// Live production contract: HTML and JSON must expose one identical, noncacheable
// Swing Leaders snapshot. No credentials or portfolio writes are required.
const assert = require("node:assert/strict");

const ORIGIN = String(process.env.QA_EN_ORIGIN || "https://www.vixale.com").replace(/\/$/, "");
const PAGE = "/trading-systems/swing-trading";
const API = "/api/swing-leaders";

async function fetchFresh(path, accept) {
  const url = ORIGIN + path + (path.includes("?") ? "&" : "?") + "vx_parity_qa=" + Date.now();
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: accept, "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, path + " must return 200");
  assert.match(response.headers.get("cache-control") || "", /(?:^|[,\s])no-store(?:[,\s]|$)/i, path + " must not be cacheable");
  assert.equal(response.headers.get("surrogate-control"), "no-store", path + " must forbid CDN caching");
  assert.equal(response.headers.get("x-vixale-swing-feed-stale"), "0", path + " must serve a fresh feed");
  assert.match(response.headers.get("x-vixale-swing-snapshot-id") || "", /^[a-f0-9]{24}$/, path + " must identify its snapshot");
  return { response, body: await response.text() };
}

async function verifyPair() {
  const [page, api] = await Promise.all([
    fetchFresh(PAGE, "text/html"),
    fetchFresh(API, "application/json"),
  ]);
  const a = page.response.headers.get("x-vixale-swing-snapshot-id");
  const b = api.response.headers.get("x-vixale-swing-snapshot-id");
  assert.equal(a, b, "Server HTML and JSON API must come from the same exact snapshot");
  const data = JSON.parse(api.body);
  assert.equal(page.response.headers.get("x-vixale-swing-snapshot-date"), data.snapshot_date);
  assert.equal(api.response.headers.get("x-vixale-swing-snapshot-date"), data.snapshot_date);
  assert.ok(page.body.includes("Snapshot " + data.snapshot_date + " · " + data.snapshot_time_et), "HTML must show current snapshot date/time");
  assert.equal(data.active_count, data.active_portfolio.length);
  assert.equal(data.intern_count, data.interns.length);
  assert.equal(data.stale, false);
  assert.equal(data.equity_history_stale, false, "Equity chart must not use a failed history refresh");
  assert.equal(data.equity_history_latest_date, data.snapshot_date, "Equity History must match the published review date");

  const anchor = page.body.indexOf('id="active-portfolio"');
  assert.ok(anchor >= 0, "Active section anchor must exist");
  const start = page.body.indexOf("<tbody>", anchor);
  const end = page.body.indexOf("</tbody>", start);
  assert.ok(start > anchor && end > start, "Active section rows must exist");
  const activeHtml = page.body.slice(start, end);
  const htmlTickers = [...activeHtml.matchAll(/data-label="Ticker"[^>]*>\s*<strong>([^<]+)<\/strong>/g)].map(m => m[1]);
  assert.deepEqual(htmlTickers, data.active_portfolio.map(item => item.ticker), "HTML must show exactly the API Active tickers in order");
  for (const item of data.active_portfolio) {
    assert.ok(activeHtml.includes("Reviewed " + item.last_review_date), "HTML must retain Active review dates");
  }
  const expected = process.env.QA_SWING_EXPECTED_DATE;
  if (expected) {
    assert.equal(data.snapshot_date, expected, "Expected production review must be published");
    assert.equal(data.equity_history_latest_date, expected, "Today's equity history must be published");
    for (const item of data.active_portfolio) {
      assert.equal(item.last_review_date, expected, item.ticker + " must display today's review");
      assert.ok(String(item.brief_note || "").trim(), item.ticker + " must have a research note");
    }
    for (const item of data.interns) {
      assert.equal(item.review_date, expected, item.ticker + " candidate review must be current");
    }
  }
  console.log(JSON.stringify({
    result: "PASS",
    origin: ORIGIN,
    snapshot_date: data.snapshot_date,
    snapshot_time_et: data.snapshot_time_et,
    snapshot_id: a,
    active_count: data.active_count,
    candidate_count: data.intern_count,
    equity_history_latest_date: data.equity_history_latest_date,
  }));
}

verifyPair().catch(error => {
  console.error("Swing production HTML/API parity verification failed:", error.message);
  process.exitCode = 1;
});
