"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");
const {
  SWING_PATH,
  GUIDE_PATH,
  SYSTEMS_PATH,
  VIDEO_ROUTE,
  CAPTIONS_ROUTE,
  POSTER_ROUTE,
  REVIEW_WINDOW,
  STYLE_ID,
  CARD_MARKER,
  parseByteRange,
  renderVideoCard,
  readVideoBuffer,
  readPosterBuffer,
  readCaptions,
  refineSwingInstructionalHtml,
} = require("../website_swing_instructional_refinement");

assert(
  packageJson.scripts.start.indexOf("-r ./website_swing_instructional_refinement.js") < packageJson.scripts.start.indexOf("-r ./website_trading_guide.js"),
  "Swing instructional refinement must load before the Trading Guide handler"
);
assert(
  packageJson.scripts.start.indexOf("-r ./website_swing_instructional_refinement.js") < packageJson.scripts.start.indexOf("-r ./website_swing_canonical_refinement.js"),
  "Swing instructional refinement must load before canonical Swing response refinement"
);

const swingHtml = `<!doctype html><html><head></head><body><main class="wrap">
<div class="hero-layout"><section class="hero"><h1>Vixale Swing Trading</h1></section></div>
<section class="how" aria-label="How Swing Leaders works"><div>9:45–10:00 AM ET</div></section>
</main></body></html>`;

const refinedSwing = refineSwingInstructionalHtml(swingHtml, SWING_PATH);
assert(refinedSwing.includes(CARD_MARKER));
assert(refinedSwing.includes(`id="${STYLE_ID}"`));
assert(refinedSwing.includes("How to Follow Vixale Swing Trading"));
assert(refinedSwing.includes(REVIEW_WINDOW));
assert(refinedSwing.includes(`src="${VIDEO_ROUTE}"`));
assert(refinedSwing.includes(`src="${CAPTIONS_ROUTE}"`));
assert(refinedSwing.includes(`poster="${POSTER_ROUTE}"`));
assert(refinedSwing.includes('<video controls preload="metadata" playsinline'));
assert(!refinedSwing.includes("autoplay"));
assert(refinedSwing.includes('kind="captions"'));
assert(!refinedSwing.includes("9:45–10:00 AM ET"));
assert.strictEqual(refineSwingInstructionalHtml(refinedSwing, SWING_PATH), refinedSwing, "Swing video refinement must be idempotent");

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
for (const forbidden of ["9:45–10:00 AM ET", "evaluated on the daily close"]) {
  assert(!refinedGuide.includes(forbidden), `obsolete Swing copy remains: ${forbidden}`);
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

const card = renderVideoCard();
for (const required of ["Potential Candidates", "Active Portfolio", "+10%", "-5%", "scheduled morning review"]) {
  assert(card.includes(required), `video surrounding copy missing: ${required}`);
}

const video = readVideoBuffer();
assert(video.length > 500000, "optimized instructional MP4 must be nontrivial");
assert.strictEqual(video.subarray(4, 8).toString("ascii"), "ftyp");
const poster = readPosterBuffer();
assert.strictEqual(poster[0], 0xff);
assert.strictEqual(poster[1], 0xd8);
assert(readCaptions().startsWith("WEBVTT"));

assert.deepStrictEqual(parseByteRange("bytes=0-99", 1000), { start: 0, end: 99 });
assert.deepStrictEqual(parseByteRange("bytes=900-", 1000), { start: 900, end: 999 });
assert.deepStrictEqual(parseByteRange("bytes=-100", 1000), { start: 900, end: 999 });
assert.strictEqual(parseByteRange("bytes=1000-1200", 1000), null);
assert.strictEqual(parseByteRange("garbage", 1000), null);

const pdfSource = fs.readFileSync(path.join(__dirname, "..", "Vixale_Trading_Guide.pdf.b64"), "utf8").trim();
const pdf = Buffer.from(pdfSource, "base64");
assert.strictEqual(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
assert(pdf.length > 20000, "Trading Guide PDF must be the reviewed five-page asset");

console.log("Swing instructional video + public timing refinement: PASS");
