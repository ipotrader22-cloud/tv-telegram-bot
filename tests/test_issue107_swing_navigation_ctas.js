"use strict";

const assert = require("assert");
const {
  CANONICAL_SWING_PATH,
  ACCESS_PATH,
  PORTFOLIO_ANCHOR_ID,
  PORTFOLIO_HREF,
  refineCanonicalSwingHtml,
} = require("../website_swing_canonical_refinement");

const sample = `<!doctype html><html><head><title>Vixale Swing Leaders</title></head><body>
<nav><a class="brand" href="/">VIXALE</a><a href="/trading-systems">Trading Systems</a><a href="/">Home</a></nav>
<main><div class="eyebrow">Swing Trading · Research</div><h1>Vixale Swing Leaders</h1>
<p>A research/model portfolio focused on actively monitored swing positions and potential future candidates from Vixale Trading Lab.</p>
<section><h2>Active Portfolio</h2><p>Public portfolio content</p></section></main>
<footer>Vixale Swing Leaders</footer></body></html>`;

const out = refineCanonicalSwingHtml(sample);
assert.strictEqual(PORTFOLIO_HREF, `${CANONICAL_SWING_PATH}#${PORTFOLIO_ANCHOR_ID}`);
assert(out.includes(`id="${PORTFOLIO_ANCHOR_ID}"`), "public portfolio target must have a stable anchor");
assert(out.includes(`href="${PORTFOLIO_HREF}">View Swing Portfolio</a>`), "first-time visitor must be able to reach the already-public Swing portfolio");
assert(out.includes(`href="${ACCESS_PATH}">Request Dashboard Access</a>`), "authenticated access must be presented separately and truthfully");
assert(!out.includes(">Watch Swings</a>"));
assert(!out.includes(">Watch Systems for Free</a>"));
assert(out.includes("Research/model portfolio"));
assert(out.includes("https://www.vixale.com/trading-systems/swing-trading"));

console.log("Issue #107 Swing public-view/access CTA split: PASS");
