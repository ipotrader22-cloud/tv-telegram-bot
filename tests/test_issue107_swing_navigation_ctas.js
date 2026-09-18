"use strict";

const assert = require("assert");
const {
  CANONICAL_SWING_PATH,
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
assert(out.includes('class="vx-swing-sequence-label">What this system is</div>'));
assert(out.includes("Use this public Swing Leaders research/model portfolio to review active positions"));
for(const section of ["How it differs","What you will see","Available publicly now","What viewer access adds","Evidence / results"])assert(out.includes(`<span>${section}</span>`),`missing Swing teaching section ${section}`);
assert(out.includes("The Swing portfolio is already public"));
assert(out.includes("No extra Swing portfolio unlock is required"));
assert(out.includes("it is not a prerequisite for the Swing Active Portfolio on this page"));
assert(out.includes("It is not brokerage-account performance."));
assert(out.includes(`href="${PORTFOLIO_HREF}">View Swing Portfolio</a>`), "the one page-specific next action must open the public portfolio");
assert.strictEqual((out.match(/>View Swing Portfolio<\/a>/g)||[]).length,1);
assert(!out.includes("Request Dashboard Access"), "Swing page must not imply viewer access is needed for its public portfolio");
assert(!out.includes(">Watch Swings</a>"));
assert(!out.includes(">Watch Systems for Free</a>"));
assert(out.includes("https://www.vixale.com/trading-systems/swing-trading"));
assert(out.indexOf("What this system is") < out.indexOf("How it differs"));
assert(out.indexOf("How it differs") < out.indexOf("What you will see"));
assert(out.indexOf("What you will see") < out.indexOf("Available publicly now"));
assert(out.indexOf("Available publicly now") < out.indexOf("What viewer access adds"));
assert(out.indexOf("What viewer access adds") < out.indexOf("Evidence / results"));
assert(out.indexOf("Evidence / results") < out.indexOf('id="active-portfolio"'));

console.log("Issue #107 PR3 Swing teaching sequence: PASS");
