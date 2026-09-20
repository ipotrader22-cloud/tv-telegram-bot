"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const feed = require("../website_home_day_preview_feed_refinement");

assert.strictEqual(feed.HOME_PATH, "/");
assert.strictEqual(feed.PUBLIC_PERFORMANCE_PATH, "/public-performance.json");
assert.strictEqual(feed.LEGACY_TARGET_ID, "vx-conversion-day-chart");
assert.strictEqual(feed.TARGET_ID, "vx-conversion-day-feed-chart");

const fixture = `<!doctype html><html><head></head><body><section class="vx-conversion-home"><button data-vx-preview-tab="day">Day Trading</button><div class="vx-conversion-chart" id="${feed.LEGACY_TARGET_ID}"><div class="vx-conversion-chart-loading">Loading realized-results chart…</div></div><div id="vx-home-equity-stage"><svg id="vx-home-equity-svg"></svg></div></section></body></html>`;
const refined = feed.refineHomeHtml(fixture, "/");

assert(refined.includes(`id="${feed.TARGET_ID}"`), "final homepage must expose the direct-feed chart target");
assert(!refined.includes(`id="${feed.LEGACY_TARGET_ID}"`), "legacy DOM-clone target must be retired from the final homepage response");
assert(refined.includes(`data-vx-day-preview-feed="${feed.PUBLIC_PERFORMANCE_PATH}"`));
assert(refined.includes(`id="${feed.SCRIPT_ID}"`));
assert(refined.includes("fetch(performancePath"), "Day preview must fetch the authoritative public performance feed directly");
assert(refined.includes("data.equity_curve&&data.equity_curve.points"), "Day preview must use the existing equity_curve.points array");
assert(refined.includes("point&&point.cumulative_pnl"), "Day preview must render existing cumulative_pnl values without recalculation");
assert(!refined.includes("cloneNode(true)"), "direct-feed preview must not clone the lower chart SVG");
assert(!refined.includes("new MutationObserver"), "direct-feed preview must not observe lower-chart layout redraws");
assert(!refined.includes("setInterval("), "direct-feed preview must not add polling");

const match = refined.match(new RegExp(`<script id=["']${feed.SCRIPT_ID}["']>([\\s\\S]*?)<\\/script>`));
assert(match, "direct-feed runtime must be injected");
assert.doesNotThrow(() => new Function(match[1]), "emitted direct-feed runtime must be valid JavaScript");

assert.strictEqual(feed.refineHomeHtml(refined, "/"), refined, "direct-feed refinement must be idempotent");
assert.strictEqual(feed.refineHomeHtml(fixture, "/results"), fixture, "non-home routes must remain unchanged");

const root = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const start = String(packageJson.scripts.start || "");
const readabilityPreload = "-r ./website_home_preview_chart_readability_fix.js";
const feedPreload = "-r ./website_home_day_preview_feed_refinement.js";
const conversionPreload = "-r ./website_conversion_home_refinement.js";
assert(start.includes(feedPreload), "direct-feed refinement must be a production preload");
assert(start.indexOf(readabilityPreload) < start.indexOf(feedPreload), "readability wrapper must remain outside the direct-feed response transform");
assert(start.indexOf(feedPreload) < start.indexOf(conversionPreload), "direct-feed wrapper must receive homepage conversion output on the response path");

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
    assert(html.includes(`id="${feed.TARGET_ID}"`), "production middleware order must convert then retarget the Day preview chart");
    assert(!html.includes(`id="${feed.LEGACY_TARGET_ID}"`), "production middleware order must leave no legacy chart target for old clone writers");
    assert(html.includes(`id="${feed.SCRIPT_ID}"`), "production middleware order must inject the direct-feed runtime");
    assert(html.includes("/public-performance.json"), "final homepage must reference the shared authoritative performance endpoint");
    console.log("Homepage Day preview direct feed: PASS");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
