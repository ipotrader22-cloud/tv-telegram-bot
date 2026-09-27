"use strict";

const assert = require("assert");

process.env.VIXALE_WORK_REDESIGN_PREVIEW = "true";
const preview = require("../website_work_redesign_preview");

const base = `<!doctype html><html><head><title>Old</title></head><body><nav><a href="/">VIXALE</a><div class="nav-links"><div class="vx-unified-public-nav"><a href="/old">Old</a></div><div class="vx-direct-nav-actions"></div></div></nav><main><section class="vx-conversion-home"><p>old home</p></section><section class="vx-home-day-trading"><div id="vx-home-equity-stage"><svg id="vx-home-equity-svg"></svg></div><strong id="vx-home-equity-total">+$10.00</strong></section></main><footer><nav class="vx-public-secondary-nav"><a href="/old">Old</a></nav></footer></body></html>`;
const home = preview.refineWorkPreview(base, "/");
assert(home.includes('data-vx-work-preview="true"'));
assert(home.includes("Trading signals you can follow. Results you can inspect."));
assert(home.includes("Get 30 Days Free"));
assert(home.includes("Choose the system that fits how you trade."));
assert(home.includes("An entry alert is only the beginning."));
assert(home.includes("Look beyond the winning trade."));
assert(home.includes("Choose one system. Or follow all three."));
assert(home.includes("Questions before you start."));
assert(home.includes("Format example · not a historical trade"));
assert(home.includes('data-vx-mirror="vx-home-equity-total"'));
assert(home.includes("prefers-reduced-motion"));
assert(home.includes('href="/trading-systems/day-trading"'));
assert(home.includes('href="/trading-systems/swing-trading"'));
assert(home.includes('href="/trading-systems/options"'));

const dayBase = `<!doctype html><html><head><title>D</title></head><body><div class="nav-links"></div><main><div class="vx-conversion-system-shell"><section class="vx-conversion-system-hero"><div><h1>Old Day</h1></div></section><section class="vx-conversion-working-screen">data</section></div></main></body></html>`;
const day = preview.refineWorkPreview(dayBase, "/trading-systems/day-trading");
assert(day.includes("Follow the trade while it happens."));
assert(day.includes("Day Trading subscription: $49/month"));
assert(day.includes('<section class="vx-conversion-working-screen">data</section>'));

const optionBase = dayBase.replace("Old Day", "Old Options");
const options = preview.refineWorkPreview(optionBase, "/trading-systems/options");
assert(options.includes("See more than the opening trade."));
assert(options.includes("The 30-day free Telegram trial applies to Day Trading."));

const pricingBase = `<!doctype html><html><head><title>P</title></head><body><main><h1>Choose one system or follow all three.</h1><a>Request 30-Day Trial</a></main></body></html>`;
const pricing = preview.refineWorkPreview(pricingBase, "/pricing");
assert(pricing.includes("Choose one system. Or follow all three."));
assert(pricing.includes("Get 30 Days Free"));

const untouched = preview.refineWorkPreview("<html><body>admin</body></html>", "/admin/live");
assert.strictEqual(untouched, "<html><body>admin</body></html>");

process.env.VIXALE_WORK_REDESIGN_PREVIEW = "false";
assert.strictEqual(preview.refineWorkPreview(base, "/"), base);

console.log("work redesign preview regression checks: ok");
