"use strict";
const assert = require("assert");
const { STYLE_ID, SCRIPT_ID, refinePublicPolish } = require("../website_public_polish_refinement");

const home = `<!doctype html><html><head></head><body><main>
<section class="vx-home-split"><h1>Watch our trading systems live before you trade them.</h1></section>
<div class="vx-home-equity-foot"><span id="vx-home-equity-status">Verified · Closed Trades ledger</span><a href="/pricing">View performance details</a></div>
<a class="btn btn-secondary" href="https://old.example.com">Book Setup Call</a>
</main></body></html>`;

const homeOut = refinePublicPolish(home, "/");
assert(homeOut.includes(`id="${STYLE_ID}"`));
assert(homeOut.includes(`id="${SCRIPT_ID}"`));
assert(homeOut.includes("font-size:clamp(27px,2.8vw,36px)!important"));
assert(homeOut.includes('id="vx-home-equity-status" class="vx-home-equity-pill" href="/closed-trades">Verified · Closed Trades ledger</a>'));
assert(homeOut.includes('class="vx-home-equity-pill" href="/pricing">View performance details</a>'));
assert(homeOut.includes(".vx-home-equity-pill,#vx-home-equity-status"));
assert(homeOut.includes("link.href = '/closed-trades'"));
assert(homeOut.includes('class="btn btn-secondary" href="/services">Our Services</a>'));
assert(!homeOut.includes("Book Setup Call"));
assert.strictEqual(refinePublicPolish(homeOut, "/"), homeOut);

const systems = '<html><head></head><body><section class="vx-systems-hero"><h1>Choose the type of system you want to explore.</h1></section><section class="vx-guide-compact"><div class="vx-guide-grid"><h3 class="vx-guide-title">Signal → Broker → Target → Stop Ref</h3></div><a class="vx-guide-btn primary">Open Trading Guide</a></section><a class="vx-category-card"><h2>Day Trading</h2><p>Vixale Prime and Vixale Edge.</p><span>Open Day Trading →</span></a></body></html>';
const systemsOut = refinePublicPolish(systems, "/trading-systems");
assert(systemsOut.includes("font-size:clamp(20px,2.5vw,31px)!important"));
assert(systemsOut.includes("font-size:clamp(19px,5vw,24px)!important"));
assert(systemsOut.includes(".vx-guide-compact .vx-guide-grid .vx-guide-title{font-size:13px!important"));
assert(systemsOut.includes("white-space:nowrap!important"));
assert(systemsOut.includes(".vx-guide-compact .vx-guide-btn.primary{background:#078f51!important;border-color:#078f51!important;color:#fff!important"));
assert(systemsOut.includes(".vx-category-grid{gap:14px!important;margin-top:34px!important}"));
assert(systemsOut.includes(".vx-category-card{min-height:0!important;padding:18px 22px!important}"));
assert(systemsOut.includes(".vx-category-card h2{margin-top:7px!important}"));
assert(systemsOut.includes(".vx-category-card p{margin-top:4px!important}"));
assert(systemsOut.includes(".vx-category-card span:last-child{margin-top:12px!important;padding-top:0!important}"));
for (const path of ["/trading-systems/day-trading", "/trading-systems/swing-trading", "/trading-systems/options"]) {
  assert(refinePublicPolish(systems, path).includes(`id="${STYLE_ID}"`));
}

const pricing = '<html><head></head><body><section class="vx-watch-page"><div class="vx-watch-hero"><h1>See the performance. Then watch the system live.</h1><p class="vx-watch-lead">This preview uses the same Closed Trades ledger as the dashboard Equity Curve. It shows aggregate performance only — no trade list, symbols, or open positions.</p></div></section></body></html>';
const pricingOut = refinePublicPolish(pricing, "/pricing");
assert(pricingOut.includes(`id="${STYLE_ID}"`));
assert(pricingOut.includes(".vx-watch-hero{max-width:680px!important}"));
assert(pricingOut.includes(".vx-watch-hero h1,.vx-watch-lead{max-width:640px!important}"));
assert(pricingOut.includes("font-size:clamp(24px,2.7vw,30px)!important"));
assert(pricingOut.includes(".vx-watch-lead{margin-top:13px!important;font-size:16px!important;line-height:1.5!important}"));
assert.strictEqual(refinePublicPolish(pricingOut, "/pricing"), pricingOut);
assert.strictEqual(refinePublicPolish(systems, "/services"), systems);

console.log("Public typography + compact cards + pricing hero polish: PASS");
