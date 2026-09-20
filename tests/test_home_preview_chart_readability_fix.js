"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const fix = require("../website_home_preview_chart_readability_fix");

assert.strictEqual(fix.computePreviewScale(1120, 245, 740, 180).toFixed(3), "1.514");
assert.strictEqual(fix.computePreviewScale(640, 250, 700, 180).toFixed(3), "1.389");
assert.strictEqual(fix.computePreviewScale(500, 180, 700, 200), 1);
assert.strictEqual(fix.computePreviewScale(0, 180, 700, 200), 1);

const stableSignature = fix.buildPreviewHistorySignature("+$23,390.02", "2", "$0.00");
assert.strictEqual(stableSignature, "+$23,390.02|2|$0.00");
assert.strictEqual(
  fix.shouldPreservePreview(stableSignature, fix.buildPreviewHistorySignature("+$23,390.02", "2", "$0.00")),
  true,
  "same realized metrics must preserve the first normalized preview even if the mirrored SVG geometry changes",
);
assert.strictEqual(
  fix.shouldPreservePreview(stableSignature, fix.buildPreviewHistorySignature("+$23,514.05", "3", "+$124.03")),
  false,
  "a real realized-metric update must be allowed to replace the preview",
);
assert.strictEqual(fix.shouldPreservePreview("", stableSignature), false);

const base = `<!doctype html><html><head></head><body><div id="${fix.TARGET_ID}"><svg viewBox="0 0 1120 245"><text font-size="9">$25,729</text><path stroke-width="2.4"></path><circle r="2.6" stroke-width="1.4"></circle></svg></div></body></html>`;
const refined = fix.refineHomeHtml(base, "/");
assert(refined.includes(`id="${fix.STYLE_ID}"`));
assert(refined.includes(`id="${fix.SCRIPT_ID}"`));
assert(refined.includes("getBoundingClientRect"));
assert(refined.includes("data-vx-preview-original-"));
assert(refined.includes("querySelectorAll('circle')"));
assert(refined.includes("circles.length>24"));
assert(refined.includes("new MutationObserver"));
assert(refined.includes("sourceSignature"));
assert(refined.includes("stableMarkup"));
assert(refined.includes("closedCountId='vx-home-live-2'"));
assert(refined.includes("closedPnlId='vx-home-live-3'"));
assert(refined.includes("shouldPreservePreview(stableSignature,nextSignature)"));
assert(refined.includes("target.innerHTML=stableMarkup"));
assert(!refined.includes("source.querySelectorAll('circle').length"), "preview identity must not depend on SVG point-marker geometry");
assert(!refined.includes("datePattern"), "preview identity must not depend on layout-generated SVG date labels");
assert(!refined.includes("fetch('/public-performance.json'"), "readability layer must not add another performance fetch");
assert(!refined.includes("setInterval("), "readability layer must not add polling");
assert.doesNotThrow(() => {
  const match = refined.match(new RegExp(`<script id=["']${fix.SCRIPT_ID}["']>([\\s\\S]*?)<\\/script>`));
  assert(match, "runtime script must be injected");
  new Function(match[1]);
});
assert.strictEqual(fix.refineHomeHtml(refined, "/"), refined, "refinement must be idempotent");
assert.strictEqual(fix.refineHomeHtml(base, "/results"), base, "non-home routes must remain unchanged");

const root = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const start = String(packageJson.scripts.start || "");
const readabilityPreload = "-r ./website_home_preview_chart_readability_fix.js";
const conversionPreload = "-r ./website_conversion_home_refinement.js";
assert(start.includes(readabilityPreload), "readability fix must be a top-level preload");
assert(start.includes(conversionPreload), "homepage conversion preload must remain registered");
assert(start.indexOf(readabilityPreload) < start.indexOf(conversionPreload), "readability preload must come before homepage conversion so its response transform runs after conversion output");
assert(start.includes("-r ./website_home_equity_empty_fix.js"), "existing home equity preload must remain registered");
const emptyFixSource = fs.readFileSync(path.join(root, "website_home_equity_empty_fix.js"), "utf8");
assert(!emptyFixSource.includes('require("./website_home_preview_chart_readability_fix");'), "late home equity preload must not own readability registration");

require("../website_conversion_home_refinement");
const express = require("express");
const app = express();
const sourceHomepage = '<!doctype html><html><head><title>Vixale</title></head><body><section class="vx-home-hero"><div class="vx-home-hero-copy"><h1>Old home</h1></div></section></body></html>';
app.get("/", (_req, res) => res.type("html").send(sourceHomepage));

const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const html = await response.text();
    assert.strictEqual(response.status, 200);
    assert(html.includes('id="vx-conversion-day-chart"'), "conversion layer must create the homepage preview chart target");
    assert(html.includes(`id="${fix.STYLE_ID}"`), "readability style must be injected into the post-conversion homepage HTML");
    assert(html.includes(`id="${fix.SCRIPT_ID}"`), "readability runtime must be injected into the post-conversion homepage HTML");
    assert(html.includes("stableMarkup"), "runtime must preserve the normalized first-paint chart when the lower chart only re-renders its layout");
    console.log("Homepage preview chart readability fix: PASS");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
