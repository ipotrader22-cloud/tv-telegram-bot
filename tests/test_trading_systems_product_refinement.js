"use strict";

const assert = require("assert");
const {
  SYSTEMS_PATH,
  STYLE_ID,
  PAGE_MARKER,
  refineTradingSystemsProductPage,
} = require("../website_trading_systems_product_refinement");

const base = `<!doctype html><html><head><title>Old Systems</title><link rel="canonical" href="https://www.vixale.com/old"></head><body>
<nav><a class="logo" href="/">VIXALE</a><div class="nav-links"><a class="vx-beginner-nav-link" href="/trading-guide">Beginner Guide</a><a class="vx-risk-management-nav-link" href="/risk-management">Risk Management</a><a href="/">Live System</a><a href="/trading-systems">Trading Systems</a><a href="#start-here">Start Here</a><a href="#services">Why It Makes Sense</a><a href="/pricing">7 Days Free</a><a href="/dashboard">Live Dashboard</a></div></nav>
<main><section><h1>Multiple markets. One transparent system hub.</h1><p>old wall of text</p></section><section><h2>How to Trade Vixale</h2></section><section><h2>Research and transparency</h2></section></main>
<footer>Important disclosure</footer></body></html>`;

const out = refineTradingSystemsProductPage(base, SYSTEMS_PATH);
assert(out.includes(PAGE_MARKER));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes("Choose the Vixale system that fits your trading horizon."));
assert(out.includes('id="day-trading"'));
assert(out.includes("Vixale Prime"));
assert(out.includes("Vixale Edge"));
assert(out.includes("Options Straddles"));
assert(out.includes('id="swing-trading"'));
assert(out.includes("Vixale Swing System"));
assert(out.includes("+10% from actual entry"));
assert(out.includes("5% stop, daily-close evaluation"));
assert(out.includes("9:45–10:00 AM ET"));
assert(out.includes('id="market-coverage"'));
assert(out.includes('id="stocks"'));
assert(out.includes('id="futures"'));
assert(out.includes('id="options"'));
assert(out.includes("In Development"));
assert(out.includes("Systems at a glance."));
assert(out.includes('href="/pricing">View Verified Performance</a>'));
assert(out.includes('href="/closed-trades">Closed Trades Archive</a>'));
assert(out.includes('href="/trading-guide">Open Trading Guide →</a>'));
assert(!out.includes("old wall of text"));
assert(!out.includes("How to Trade Vixale"));
assert(out.includes("<footer>Important disclosure</footer>"));
assert(out.includes("<title>Vixale | Trading Systems</title>"));
assert(out.includes('href="https://www.vixale.com/trading-systems"'));
assert(!out.includes("Beginner Guide</a>"));
assert(!out.includes("Risk Management</a>"));
assert(out.includes('href="/">Home</a>'));
assert(out.includes('href="https://t.me/tradervip22">Telegram</a>'));
assert(out.includes('href="/services">Services</a>'));
assert(out.includes('href="/pricing">Watch System for Free</a>'));
assert.strictEqual(refineTradingSystemsProductPage(out, SYSTEMS_PATH), out, "product refinement must be idempotent");
assert.strictEqual(refineTradingSystemsProductPage(base, "/"), base, "non-systems page must remain unchanged");

console.log("Trading Systems product redesign: PASS");
