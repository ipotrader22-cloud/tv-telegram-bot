"use strict";

const assert = require("assert");
const { STYLE_ID, SCRIPT_ID, refinePublicNav, refineWatchSystemPage } = require("../website_watch_system_refinement");

const base = `<!doctype html><html><head><title>Vixale | 7 Days Free</title></head><body><nav><div class="nav-links"><a href="/">Home</a><a href="/pricing">7 Days Free</a><a href="#partners">Creators</a></div></nav><main><section><h1>Watch Vixale free for 7 days.</h1><p>wall of text</p></section></main><footer>risk</footer></body></html>`;

const nav = refinePublicNav(base);
assert(nav.includes('href="/pricing">Watch System for Free</a>'));
assert(!nav.includes('>7 Days Free</a>'));
assert(!nav.includes('>Creators</a>'));

const out = refineWatchSystemPage(base, "/pricing");
assert(out.includes("<title>Vixale | Watch System for Free</title>"));
assert(out.includes("See the performance. Then watch the system live."));
assert(out.includes("Verified performance preview"));
assert(out.includes("Closed Trades ledger"));
assert(out.includes("Equity Curve — Realized P&amp;L"));
assert(out.includes("Open P&amp;L excluded"));
assert(out.includes("fetch('/public-performance.json'"));
assert(out.includes('href="/#password-access">Request 7-Day Access</a>'));
assert(out.includes('href="/dashboard">Dashboard Login</a>'));
assert(out.includes('id="vx-watch-chart-svg"'));
assert(out.includes('id="vx-watch-closed-count"'));
assert(out.includes('id="vx-watch-win"'));
assert(out.includes("No fallback or simulated values are shown."));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(!out.includes("wall of text"));
assert(!out.includes("Watch Vixale free for 7 days."));
assert(out.includes("<footer>risk</footer>"));
assert.strictEqual(refineWatchSystemPage(out, "/pricing"), out, "pricing refinement must be idempotent");

const systems = refineWatchSystemPage(base, "/trading-systems");
assert(systems.includes("Watch System for Free"));
assert(systems.includes("wall of text"), "non-pricing page body must be preserved");
assert(!systems.includes(`id="${STYLE_ID}"`));

console.log("Watch System performance page refinement: PASS");
