"use strict";

const assert = require("assert");
const fs = require("fs");
const fix = require("../website_home_preview_chart_readability_fix");

assert.strictEqual(fix.computePreviewScale(1120, 245, 740, 180).toFixed(3), "1.514");
assert.strictEqual(fix.computePreviewScale(640, 250, 700, 180).toFixed(3), "1.389");
assert.strictEqual(fix.computePreviewScale(500, 180, 700, 200), 1);
assert.strictEqual(fix.computePreviewScale(0, 180, 700, 200), 1);

const base = `<!doctype html><html><head></head><body><div id="${fix.TARGET_ID}"><svg viewBox="0 0 1120 245"><text font-size="9">$25,729</text><path stroke-width="2.4"></path><circle r="2.6" stroke-width="1.4"></circle></svg></div></body></html>`;
const refined = fix.refineHomeHtml(base, "/");
assert(refined.includes(`id="${fix.STYLE_ID}"`));
assert(refined.includes(`id="${fix.SCRIPT_ID}"`));
assert(refined.includes("getBoundingClientRect"));
assert(refined.includes("data-vx-preview-original-font-size"));
assert(refined.includes("querySelectorAll('circle')"));
assert(refined.includes("circles.length>24"));
assert(refined.includes("new MutationObserver"));
assert.doesNotThrow(() => {
  const match = refined.match(new RegExp(`<script id=["']${fix.SCRIPT_ID}["']>([\\s\\S]*?)<\\/script>`));
  assert(match, "runtime script must be injected");
  new Function(match[1]);
});
assert.strictEqual(fix.refineHomeHtml(refined, "/"), refined, "refinement must be idempotent");
assert.strictEqual(fix.refineHomeHtml(base, "/results"), base, "non-home routes must remain unchanged");

const packageJson = JSON.parse(fs.readFileSync(require.resolve("../package.json"), "utf8"));
assert(packageJson.scripts.start.includes("-r ./website_conversion_home_refinement.js -r ./website_home_preview_chart_readability_fix.js"));

console.log("Homepage preview chart readability fix: PASS");
