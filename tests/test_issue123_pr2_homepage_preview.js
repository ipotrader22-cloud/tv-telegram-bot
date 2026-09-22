"use strict";

const assert = require("assert");
const offer = require("../lib/website-commercial-offer");
const home = require("../website_conversion_home_refinement");

assert.strictEqual(offer.DAY_TRIAL_DAYS, 30);
assert.strictEqual(offer.SINGLE_SYSTEM_PRICE_MONTHLY, 49);
assert.strictEqual(offer.THREE_SYSTEM_BUNDLE_PRICE_MONTHLY, 99);
assert.strictEqual(offer.BUNDLE_SAVINGS_MONTHLY, 48);
assert.strictEqual(offer.THREE_SYSTEM_BUNDLE.name, "Three-System Bundle");
assert.strictEqual(offer.THREE_SYSTEM_BUNDLE.includes.length, 3);
assert(offer.DAY_TRIAL_REQUEST_TEXT.includes("30-day free Day Trading Telegram signals trial"));
assert(!/swing|options/i.test(offer.DAY_TRIAL_REQUEST_TEXT), "trial request must remain Day Trading only");

const hero = home.renderHeroAndPreview();
assert(hero.includes("Trading signals. Three systems. Your choice."));
assert(hero.includes("Follow Day Trading live, explore a daily Swing portfolio, or track Options positions. See the trades and results, then choose your system."));
assert(hero.includes(`href="${offer.DAY_TRIAL_URL}"`));
assert(hero.includes(">Telegram Signals</a>"));
assert(hero.includes('class="vx-conversion-btn" href="/#password-access">Live Access</a>'));
assert(hero.includes('href="/results">View Trading Results</a>'));
assert(!hero.includes(">Get 30 Days Free</a>"));
assert(hero.includes("30-day free trial of Day Trading Telegram signals."));

assert(hero.includes('role="tablist"'));
for (const key of ["day", "swing", "options"]) {
  assert(hero.includes(`data-vx-preview-tab="${key}"`), `missing ${key} tab`);
  assert(hero.includes(`data-vx-preview-panel="${key}"`), `missing ${key} panel`);
}
assert(hero.includes('id="vx-preview-tab-day" type="button" role="tab" aria-selected="true"'));
assert(hero.includes('id="vx-preview-swing"') && hero.includes('hidden'), "non-default Swing panel must begin hidden");
assert(hero.includes('id="vx-preview-options"') && hero.includes('hidden'), "non-default Options panel must begin hidden");

assert(hero.includes("Day Trading — Live Overview"));
assert(hero.includes('data-vx-mirror="vx-home-live-0"'));
assert(hero.includes('data-vx-mirror="vx-home-live-open-pnl"'));
assert(hero.includes('data-vx-mirror="vx-home-live-3"'));
assert(hero.includes('data-vx-mirror="vx-home-equity-total"'));
assert(hero.includes('data-vx-mirror-text="vx-home-day-badge"'));
assert(hero.includes('data-vx-mirror-text="vx-home-day-updated"'));
assert(!hero.includes("vx-home-open-pnl"), "must use the real existing Open P&L source id");

assert(hero.includes("Daily portfolio preview"));
assert(hero.includes('href="/trading-systems/swing-trading#active-portfolio">View Swing Portfolio'));
assert(!hero.includes("Quotes delayed"), "new sales preview must use daily-update wording");
assert(hero.includes("Daily website updates"));
assert(hero.includes("Position details and supporting records are protected."));
assert(hero.includes('href="/access?system=options">Get Dashboard Access</a>'));
assert(!hero.includes("$0.00") && !hero.includes("+10.00%"), "Options public preview must not fabricate sample results");

for (const phrase of [
  "Watch the trades. Get the signals.",
  "Two active strategies working across 5, 15, 30 and 60-minute charts.",
  "Follow a portfolio reviewed every day.",
  "Vixale's proprietary ranking system",
  "Follow positions from open to close.",
  "actively managed options system with daily position updates",
]) assert(hero.includes(phrase), `missing approved card copy: ${phrase}`);
assert(hero.includes('href="/trading-systems/day-trading">Explore Day Trading'));
assert(hero.includes('href="/trading-systems/swing-trading#active-portfolio">View Swing Portfolio'));
assert(hero.includes('href="/trading-systems/options">Explore Options'));

const base = `<!doctype html><html><head><title>Old</title></head><body><section class="vx-home-top-systems"><div>Old How It Works wall</div></section><section id="live-day-trading" class="vx-home-day-trading"><div id="vx-home-live-0">2</div><div id="vx-home-live-open-pnl">+$15.00</div><div id="vx-home-live-3">+$25.00</div><div id="vx-home-equity-total">+$500.00</div><span id="vx-home-day-badge">Market open</span><span id="vx-home-day-updated">Last updated: now</span><div id="vx-home-equity-stage"><svg id="vx-home-equity-svg"></svg></div></section><footer>footer</footer></body></html>`;
const refined = home.refineConversionHomepage(base);
assert(refined.includes('class="vx-conversion-home"'));
assert(!refined.includes("Old How It Works wall"), "old pre-data explanatory wall must be replaced");
assert(refined.includes('class="vx-home-day-trading"'), "existing lower Day data source must remain for safe mirroring");
assert(refined.includes(`id="${home.STYLE_ID}"`));
assert(refined.includes(`id="${home.SCRIPT_ID}"`));
assert(refined.includes("fetch('/api/swing-leaders'"), "Swing tab must reuse the existing public Swing API");
assert(!refined.includes("setInterval("), "homepage tabs must not add interval polling");
assert(refined.includes("ArrowLeft") && refined.includes("ArrowRight") && refined.includes("Home") && refined.includes("End"), "tabs must support keyboard navigation");
assert(refined.includes("prefers-reduced-motion:reduce"));
assert(refined.includes("font-size:clamp(34px,10.5vw,40px)"), "mobile hero size must remain compact");
assert(refined.includes("grid-template-columns:minmax(0,40fr) minmax(0,60fr)"), "desktop hero must use approximately 40/60 composition");
assert.strictEqual(home.refineConversionHomepage(refined), refined, "homepage refinement must be idempotent");

console.log("Issue #123 PR2 homepage product preview + access actions: PASS");
