"use strict";

const assert = require("assert");
const {
  SWING_PATH,
  NAV_CLASS,
  STYLE_ID,
  refineSwingStrategyNavPosition,
} = require("../website_swing_strategy_nav_position_refinement");

const fixture = `<!doctype html><html><head><title>Swing</title></head><body><main class="wrap" data-vx-conversion-system-page="swing">
<nav class="${NAV_CLASS}" aria-label="Vixale trading systems"><a href="/trading-systems/day-trading">Day Trading</a><a class="active" aria-current="page" href="/trading-systems/swing-trading">Swing Trading</a><a href="/trading-systems/options">Options</a></nav>
<div class="hero-layout"><section class="hero"><div class="eyebrow">SWING TRADING</div><h1>Active Portfolio</h1></section><section class="summary">Summary</section></div>
</main></body></html>`;

const out = refineSwingStrategyNavPosition(fixture, SWING_PATH);
const heroIndex = out.indexOf('<section class="hero">');
const navIndex = out.indexOf(`class="${NAV_CLASS}"`);
const eyebrowIndex = out.indexOf('<div class="eyebrow">SWING TRADING</div>');
const headingIndex = out.indexOf('<h1>Active Portfolio</h1>');

assert(heroIndex >= 0, "Swing hero must remain present");
assert(navIndex > heroIndex, "strategy menu must move inside the Swing hero");
assert(navIndex < eyebrowIndex, "strategy menu must sit immediately above the SWING TRADING eyebrow");
assert(eyebrowIndex < headingIndex, "SWING TRADING eyebrow must remain above Active Portfolio");
assert.strictEqual((out.match(new RegExp(`class=\\"${NAV_CLASS}\\"`, "g")) || []).length, 1, "strategy menu must not be duplicated");
assert(out.includes(`id="${STYLE_ID}"`), "Swing menu placement style must be injected");
assert(out.includes(`.hero>.${NAV_CLASS}{margin:0 0 18px}`), "desktop spacing must keep the menu visually attached to the hero eyebrow");
assert.strictEqual(refineSwingStrategyNavPosition(out, SWING_PATH), out, "Swing menu placement refinement must be idempotent");

const unrelated = '<!doctype html><html><head></head><body><main>Other page</main></body></html>';
assert.strictEqual(refineSwingStrategyNavPosition(unrelated, "/pricing"), unrelated, "unrelated public pages must not change");

console.log("Swing strategy menu placement above hero eyebrow: PASS");
