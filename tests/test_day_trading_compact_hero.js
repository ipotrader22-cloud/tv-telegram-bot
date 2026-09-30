"use strict";
const assert = require("assert");
const day = require("../website_day_trading_live_access_refinement");

const html = `<!doctype html><html><head><title>Day</title></head><body><main><div class="vx-conversion-system-shell" data-vx-conversion-system-page="day">
<section class="vx-conversion-system-hero"><div><span>DAY TRADING</span><h1>Live stock signals and P&amp;L.</h1><p>Follow entries, exits, targets, stop levels and current Day Trading performance.</p><div class="vx-conversion-system-actions"><a class="primary" href="https://example.com/day-trial" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a href="/results#day-trading">View Day Trading Results</a></div><div class="vx-conversion-offer-line"><strong>Day Trading</strong><span>$49/month · Single System</span></div></div></section>
<section class="vx-conversion-working-screen"><div>working screen</div></section></div></main></body></html>`;

const out = day.refineDayTradingLiveAccess(html, day.DAY_PATH);
assert(out.includes(day.BUTTON_MARKER));
assert(out.includes(day.COMPACT_MARKER));
assert(out.includes(day.SIGNALS_MARKER));
assert(out.includes('class="vx-day-signals-panel"'));
assert(out.includes("Recent Day Trading Signals"));
assert(out.includes("Live on Telegram"));
assert(out.includes('href="https://example.com/day-trial"'));
assert(out.includes(`fetch('${day.CLOSED_TRADES_PATH}'`));
assert(out.includes("[data-archive-row]"));
assert(out.includes('id="vx-day-compact-hero-style"'));
assert(out.includes('id="vx-day-recent-signals-script"'));
assert(out.includes("@media(max-width:900px)"));
assert(out.indexOf("vx-day-signals-panel") < out.indexOf("vx-conversion-working-screen"));
assert(!out.includes("Choose how to follow."));
assert(!out.includes("Public results"));
assert(!out.includes("Open Access"));
assert(!out.includes("NVDA"));
assert(!out.includes("TSLA"));
assert.strictEqual(day.refineDayTradingLiveAccess(out, day.DAY_PATH), out, "refinement should be idempotent");
assert.strictEqual(day.refineDayTradingLiveAccess(html, "/pricing"), html, "other routes must be unchanged");

const ru = day.refineDayTradingLiveAccess(html, day.DAY_PATH, true);
assert(ru.includes("Последние сигналы Day Trading"));
assert(ru.includes("Live в Telegram"));
assert(ru.includes("Открытые и ожидающие сделки остаются защищёнными."));
assert(!ru.includes("Recent Day Trading Signals"));

// Exercise the shipped browser renderer, including data/CTA boundaries.
const vm = require("node:vm");
async function renderFixture(isRussian, values, fails = false) {
  const target = { innerHTML: "" };
  const requests = [];
  const sourceRows = values.map(row => ({ querySelectorAll(selector) {
    assert.strictEqual(selector, "td");
    return row.map(textContent => ({ textContent }));
  } }));
  const context = {
    document: { querySelector: () => target },
    DOMParser: class { parseFromString() { return { querySelectorAll(selector) {
      assert.strictEqual(selector, "[data-archive-row]", "read only the existing public archive rows");
      return sourceRows;
    } }; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: !fails, status: fails ? 503 : 200, text: async () => "public closed-trades fixture" };
    },
  };
  const script = day.recentSignalsScript(isRussian).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].url, "/closed-trades");
  assert.strictEqual(requests[0].options.credentials, "same-origin");
  assert.strictEqual(requests[0].options.cache, "no-store");
  return target.innerHTML;
}
(async () => {
  const values = [
    ["10:30", "MSFT", "LONG", "$100", "$101", "25", "+$25", "Closed"],
    ["10:29", "GDX", "SHORT", "$100", "$101", "25", "-$25", "Closed"],
    ["10:28", "TLT", "SHORT", "$100", "$99", "25", "+$25", "Closed"],
    ["10:27", "AAPL", "LONG", "$100", "$100", "25", "—", "Closed"],
    ["10:26", "<TEST>", "short", "$100", "$101", "25", "−$25", "Closed"],
    ["10:25", "SIXTH", "LONG", "$100", "$101", "25", "+$25", "Closed"],
  ];
  for (const locale of [false, true]) {
    const rendered = await renderFixture(locale, values);
    assert.strictEqual((rendered.match(/class="vx-day-signal-row/g) || []).length, 5);
    assert.strictEqual((rendered.match(/vx-day-signal-short/g) || []).length, 3);
    assert.strictEqual((rendered.match(/vx-day-signal-pnl negative/g) || []).length, 2);
    assert.strictEqual((rendered.match(/vx-day-signal-pnl neutral/g) || []).length, 1);
    assert(rendered.indexOf("MSFT") < rendered.indexOf("GDX") && rendered.indexOf("GDX") < rendered.indexOf("TLT"));
    assert(!rendered.includes("SIXTH"));
    assert(rendered.includes("&lt;TEST&gt;") && !rendered.includes("<TEST>"));
    assert(rendered.includes(locale ? "Вход" : "Entry"));
    assert((await renderFixture(locale, [])).includes(locale ? "пока нет" : "No closed trades"));
    assert((await renderFixture(locale, [], true)).includes(locale ? "недоступны" : "unavailable"));
  }
  const beforeLinks = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  for (const href of beforeLinks) assert(out.includes(`href="${href}"`));
  assert(out.includes(`href="${day.LIVE_ACCESS_HREF}"`));
  const working = html.slice(html.indexOf('<section class="vx-conversion-working-screen"'));
  assert(out.includes(working.split("</body>")[0]), "working screen remains unchanged");
  console.log("Day Trading recent signals panel: PASS (EN/RU rendering, direction, P&L, ordering, escaping, states and boundaries)");
})().catch(error => { console.error(error); process.exitCode = 1; });
