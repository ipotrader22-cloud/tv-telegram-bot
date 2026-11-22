"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const results = require("../website_conversion_results_refinement");
const { resultsAsset } = require("../lib/website-public-assets");
const { finiteMetric } = require("../public/vixale-results");

const main = results.renderResultsMain();
assert.match(main, /id="vx-results-day-chart"/);
assert.match(main, /id="vx-results-options-chart"/);
assert.match(main, /href="#swing-trading"/);
assert.match(main, /Log in to view portfolio/);
assert.doesNotMatch(main, /id="vx-results-swing-chart"|role="link"/);

const html = results.refineResults("<!doctype html><html><head></head><body><main></main></body></html>");
assert(html.includes('defer src="' + resultsAsset.url + '"'));
const chromeCode = fs.readFileSync(path.join(__dirname, "../public/vixale-results.js"), "utf8");
assert.doesNotThrow(() => new vm.Script(chromeCode));
assert.doesNotMatch(chromeCode, /\/api\/swing-leaders/);
for (const value of [null, undefined, false, "", " ", Infinity]) assert.equal(finiteMetric(value), null);
assert.equal(finiteMetric("0"), 0);
assert.equal(finiteMetric(0), 0);
assert.equal(finiteMetric("-3.5"), -3.5);

console.log("Public Results evidence and null-value contracts passed.");
