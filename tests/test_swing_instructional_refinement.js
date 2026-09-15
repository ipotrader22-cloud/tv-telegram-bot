"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");
const {
  SWING_PATH,
  GUIDE_PATH,
  SYSTEMS_PATH,
  REVIEW_WINDOW,
  refineSwingInstructionalHtml,
} = require("../website_swing_instructional_refinement");

assert(
  packageJson.scripts.start.indexOf("-r ./website_swing_instructional_refinement.js") < packageJson.scripts.start.indexOf("-r ./website_trading_guide.js"),
  "Swing public-copy refinement must load before the Trading Guide handler"
);
assert(
  packageJson.scripts.start.indexOf("-r ./website_swing_instructional_refinement.js") < packageJson.scripts.start.indexOf("-r ./website_swing_canonical_refinement.js"),
  "Swing public-copy refinement must load before canonical Swing response refinement"
);

const swingHtml = `<!doctype html><html><head></head><body><main class="wrap">
<div class="hero-layout"><section class="hero"><h1>Vixale Swing Trading</h1></section></div>
<section class="how" aria-label="How Swing Leaders works"><div>9:45–10:00 AM ET</div></section>
</main></body></html>`;

const refinedSwing = refineSwingInstructionalHtml(swingHtml, SWING_PATH);
assert(refinedSwing.includes(REVIEW_WINDOW));
assert(!refinedSwing.includes("9:45–10:00 AM ET"));
assert(!refinedSwing.includes("How to Follow Vixale Swing Trading"));
assert(!refinedSwing.includes("<video"));
assert(!refinedSwing.includes("how-to-follow-vixale-swing-trading"));
assert.strictEqual(refineSwingInstructionalHtml(refinedSwing, SWING_PATH), refinedSwing, "Swing public-copy refinement must be idempotent");

const guideHtml = `<section id="swing-trading">
<h2>Check the portfolio each morning.</h2>
<p>Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.</p>
<strong>Check 9:45–10:00 AM ET</strong>
<p>Open the Swing Trading section and review Active Portfolio for additions or removals.</p>
<p>From your actual entry price, use a +10% profit target and a -5% stop.</p>
<p>If the symbol drops off Active Portfolio, close at market as soon as practical.</p>
<div>A portfolio removal is an exit instruction. Actual market fills can differ from the example price.</div>
<div>Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.</div>
</section>
<section id="options">Watch 6:00–8:30 PM ET</section>`;

const refinedGuide = refineSwingInstructionalHtml(guideHtml, GUIDE_PATH);
for (const required of [
  REVIEW_WINDOW,
  "updated once per trading day",
  "GTC sell limit",
  "morning-review stop reference",
  "not an automatic intraday stop order",
  "independent exit instruction",
  "6:00–8:30 PM ET",
]) assert(refinedGuide.includes(required), `missing guide content: ${required}`);
for (const forbidden of ["9:45–10:00 AM ET", "evaluated on the daily close", "<video"]) {
  assert(!refinedGuide.includes(forbidden), `obsolete or removed Swing content remains: ${forbidden}`);
}

const systemsHtml = `<div>A systematic multi-session portfolio reviewed each trading morning during the 9:45–10:00 AM ET update window.</div>
<div>5% stop level, evaluated on the daily close.</div>
<div>Check for updates each trading morning from 9:45–10:00 AM ET.</div>`;
const refinedSystems = refineSwingInstructionalHtml(systemsHtml, SYSTEMS_PATH);
assert(refinedSystems.includes(REVIEW_WINDOW));
assert(refinedSystems.includes("scheduled morning review"));
assert(refinedSystems.includes("not an intraday stop order"));
assert(!refinedSystems.includes("9:45–10:00 AM ET"));
assert(!refinedSystems.includes("evaluated on the daily close"));
assert(!refinedSystems.includes("<video"));

const pdfSource = fs.readFileSync(path.join(__dirname, "..", "Vixale_Trading_Guide.pdf.b64"), "utf8").trim();
const pdf = Buffer.from(pdfSource, "base64");
assert.strictEqual(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
assert(pdf.length > 5000, "Trading Guide PDF must remain intact");

console.log("Swing public timing refinement without instructional video: PASS");
