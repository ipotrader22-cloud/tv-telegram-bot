"use strict";

const assert = require("assert");
const fs = require("fs");
const pages = require("../website_conversion_system_pages_refinement");
const offer = require("../lib/website-commercial-offer");

assert.strictEqual(offer.SINGLE_SYSTEM_PRICE_MONTHLY, 49);
assert.strictEqual(pages.PUBLIC_PERFORMANCE_PATH, "/public-performance.json");
assert.strictEqual(pages.LIVE_OPEN_PNL_PATH, "/public-live-open-pnl.json");

const day = pages.renderDayMain();
assert(day.includes("Live stock signals and P&amp;L."));
assert(day.includes("Day Trading — Live Overview"));
assert(day.includes("Open Positions"));
assert(day.includes("Open P&amp;L"));
assert(day.includes("Closed P&amp;L Today"));
assert(day.includes("Total Realized P&amp;L"));
assert(day.includes(offer.DAY_TRIAL_URL));
assert(day.includes("30-day free trial applies only to Day Trading Telegram signals"));
assert(day.includes("Day Trading · $49/month"));
assert(day.includes('/results#day-trading'));
assert(day.includes('/closed-trades'));

const base = '<!doctype html><html><head><title>Old</title></head><body><header>KEEP NAV</header><main><section>OLD MAIN</section></main><footer>KEEP FOOTER</footer></body></html>';
const refinedDay = pages.refineSystemPage(base, pages.DAY_PATH);
assert(refinedDay.includes('<title>Vixale | Day Trading</title>'));
assert(refinedDay.includes('KEEP NAV'));
assert(refinedDay.includes('KEEP FOOTER'));
assert(!refinedDay.includes('OLD MAIN'));
assert(refinedDay.includes('id="vx-conversion-day-page-script"'));
assert(refinedDay.includes("fetch('/public-performance.json'"));
assert(refinedDay.includes("fetch('/public-live-open-pnl.json'"));
assert(!refinedDay.includes('setInterval('), 'Day system page must not add a second polling interval');

const options = pages.renderOptionsMain();
assert(options.includes("Follow positions from open to close."));
assert(options.includes("Options — Daily Position Updates"));
assert(options.includes("No sample P&amp;L or fabricated trades are shown publicly."));
assert(options.includes("Swing and Options Telegram signal delivery is not being promised."));
assert(options.includes('/trading-systems/options/viewer'));
assert(options.includes('Options · $49/month'));
assert(!/sample[^<]*(\$|\+\d|\-\d)/i.test(options), 'Options public page must not invent sample financial values');

const swingFixture = '<!doctype html><html><head><title>Vixale Swing Leaders</title></head><body><main class="wrap"><div class="hero-layout"><section class="hero"><div class="eyebrow">Swing Trading · Swing Leaders</div><h1>Vixale Swing Trading</h1><div class="vx-swing-sequence-label">What this system is</div><p class="hero-copy">Use this public Swing Leaders research/model portfolio to review active positions, potential candidates, closed trades, and model equity history. Quotes may be delayed; this is not broker execution.</p><div class="vx-swing-access"><p>OLD PRIMER WALL</p></div><div class="stamp"><span>Quotes GOOGLEFINANCE · may be delayed</span></div></section><section><h2 id="active-portfolio">Active Portfolio</h2><table><tr><td>REAL PORTFOLIO</td></tr></table></section></div></main></body></html>';
const swing = pages.refineSystemPage(swingFixture, pages.SWING_PATH);
assert(swing.includes("Follow a portfolio reviewed every day."));
assert(swing.includes("View Active Portfolio"));
assert(swing.includes("Reviewed each trading morning"));
assert(swing.includes("REAL PORTFOLIO"), 'existing live Swing portfolio must remain present');
assert(!swing.includes("OLD PRIMER WALL"));
assert(swing.includes('data-vx-conversion-system-page="swing"'));
assert(swing.includes('$49/month'));

assert.strictEqual(pages.refineSystemPage(base, "/dashboard"), base, 'protected routes must not be rewritten');
const packageJson = JSON.parse(fs.readFileSync(require.resolve("../package.json"), "utf8"));
assert(packageJson.scripts.start.startsWith("node -r ./website_conversion_system_pages_refinement.js -r ./website_conversion_home_refinement.js -r ./website_conversion_navigation_refinement.js"));

console.log("Issue #123 PR3 system pages regression PASS");
