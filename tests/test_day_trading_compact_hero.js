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

console.log("Day Trading recent signals panel: PASS");
