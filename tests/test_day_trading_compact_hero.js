"use strict";
const assert = require("assert");
const day = require("../website_day_trading_live_access_refinement");

const html = `<!doctype html><html><head><title>Day</title></head><body><main><div class="vx-conversion-system-shell" data-vx-conversion-system-page="day">
<section class="vx-conversion-system-hero"><div><span>DAY TRADING</span><h1>Live stock signals and P&amp;L.</h1><p>Follow entries, exits, targets, stop levels and current Day Trading performance.</p><div class="vx-conversion-system-actions"><a class="primary" href="https://example.com/day-trial" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a><a href="/results#day-trading">View Day Trading Results</a></div><div class="vx-conversion-offer-line"><strong>Day Trading</strong><span>$49/month · Single System</span></div></div></section>
<section class="vx-conversion-working-screen"><div>working screen</div></section></div></main></body></html>`;

const out = day.refineDayTradingLiveAccess(html, day.DAY_PATH);
assert(out.includes(day.BUTTON_MARKER));
assert(out.includes(day.COMPACT_MARKER));
assert(out.includes('class="vx-day-compact-panel"'));
assert(out.includes("Choose how to follow."));
assert(out.includes("Public results"));
assert(out.includes("Live access"));
assert(out.includes("Telegram signals"));
assert(out.includes('href="https://example.com/day-trial"'));
assert(out.includes('id="vx-day-compact-hero-style"'));
assert(out.includes("@media(max-width:900px)"));
assert(out.indexOf("vx-day-compact-panel") < out.indexOf("vx-conversion-working-screen"));
assert(!out.includes("NVDA"));
assert(!out.includes("TSLA"));
assert.strictEqual(day.refineDayTradingLiveAccess(out, day.DAY_PATH), out, "refinement should be idempotent");
assert.strictEqual(day.refineDayTradingLiveAccess(html, "/pricing"), html, "other routes must be unchanged");

const ru = day.refineDayTradingLiveAccess(html, day.DAY_PATH, true);
assert(ru.includes("Выберите, как следить за системой."));
assert(ru.includes("Публичные результаты"));
assert(ru.includes("Сигналы в Telegram"));
assert(ru.includes("Live-доступ"));
assert(!ru.includes("Choose how to follow."));

console.log("Day Trading compact hero: PASS");
