"use strict";

const assert = require("assert");
const {
  VIDEO_PATH,
  POSTER_PATH,
  CAPTIONS_PATH,
  injectSwingVideo,
  refineSwingGuideHtml,
} = require("../website_swing_education_refinement");

const swingHtml = `<!doctype html><html><head></head><body><main><div class="hero-layout"></div><section class="how" aria-label="How Swing Leaders works"></section></main></body></html>`;
const refinedSwing = injectSwingVideo(swingHtml);
for (const required of [
  "How to Follow Vixale Swing Trading",
  VIDEO_PATH,
  POSTER_PATH,
  CAPTIONS_PATH,
  'controls playsinline preload="metadata"',
  'kind="captions"',
  'label="English"',
]) assert(refinedSwing.includes(required), `missing video integration: ${required}`);
assert(!refinedSwing.includes("autoplay"), "instructional video must not autoplay");
assert.strictEqual(injectSwingVideo(refinedSwing), refinedSwing, "video injection must be idempotent");

const oldGuide = `
<strong>Check 9:45–10:00 AM ET</strong><span>Review Active Portfolio each trading day for updates.</span>
<span>Use a +10% target and a -5% stop from your actual entry price.</span>
<p>Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.</p>
<p>Open the Swing Trading section and review Active Portfolio for additions or removals.</p>
<p>From your actual entry price, use a +10% profit target and a -5% stop.</p>
<span>Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.</span>`;
const guide = refineSwingGuideHtml(oldGuide);
assert(guide.includes("10:00–11:00 AM ET"));
assert(guide.includes("once-daily"));
assert(guide.includes("not an automatic intraday stop order"));
assert(guide.includes("may fill intraday"));
assert(guide.includes("close at market as soon as practical"));
assert(!guide.includes("9:45–10:00 AM ET"));
assert.strictEqual(refineSwingGuideHtml(guide), guide, "guide refinement must be idempotent");

console.log("Swing instructional video + public review window: PASS");
