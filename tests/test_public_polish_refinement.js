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
assert(systemsOut.includes(".vx-category-card{min-height:220px!important;padding-top:22px!important;padding-bottom:22px!important}"));
assert(systemsOut.includes(".vx-category-card h2{margin-top:9px!important}"));
assert(systemsOut.includes(".vx-category-card p{margin-top:5px!important}"));
assert(systemsOut.includes(".vx-category-card span:last-child{padding-top:12px!important}"));
for (const path of ["/trading-systems/day-trading", "/trading-systems/swing-trading", "/trading-systems/options"]) {
  assert(refinePublicPolish(systems, path).includes(`id="${STYLE_ID}"`));
}
assert.strictEqual(refinePublicPolish(systems, "/services"), systems);

console.log("Public typography + performance CTA polish: PASS");
