"use strict";

const assert = require("assert");
const home = require("../website_conversion_home_refinement");
const results = require("../website_conversion_results_refinement");
const finalQa = require("../website_conversion_final_qa_refinement");
const systemPages = require("../website_conversion_system_pages_refinement");

function extractInlineScript(html, id) {
  const pattern = new RegExp(`<script id=["']${id}["']>([\\s\\S]*?)<\\/script>`);
  const match = String(html).match(pattern);
  assert(match, `expected inline script ${id}`);
  return match[1];
}

function assertParses(source, label) {
  assert.doesNotThrow(() => new Function(source), `${label} must remain valid JavaScript after HTML injection`);
}

const base = "<!doctype html><html><head></head><body><main>fixture</main></body></html>";

const homeHtml = home.injectAssets(base);
const homeJs = extractInlineScript(homeHtml, home.SCRIPT_ID);
assert(homeJs.includes("return n>0?'+$'+a:n<0?'-$'+a:'$0.00'"));
assertParses(homeJs, "conversion homepage script");
assert.strictEqual((homeHtml.match(/<\/html>/g) || []).length, 1);

const resultsHtml = results.injectAssets(base);
const resultsJs = extractInlineScript(resultsHtml, results.SCRIPT_ID);
assert(resultsJs.includes("return n>0?'+$'+a:n<0?'-$'+a:'$0.00'"));
assertParses(resultsJs, "conversion results script");
assert.strictEqual((resultsHtml.match(/<\/html>/g) || []).length, 1);

const finalHtml = finalQa.refineHomeHtml(base);
const finalJs = extractInlineScript(finalHtml, "vx-issue123-pr7-final-script");
assert(finalJs.includes("return(n<0?'-$':'$')+a"));
assertParses(finalJs, "PR7 final homepage chart script");
assert.strictEqual((finalHtml.match(/<\/html>/g) || []).length, 1);

const dayHtml = systemPages.injectAssets(base, systemPages.DAY_PATH);
const dayJs = extractInlineScript(dayHtml, systemPages.DAY_SCRIPT_ID);
assert(dayJs.includes("return n>0?'+$'+a:n<0?'-$'+a:'$0.00'"));
assert(dayJs.includes("fetch('/public-performance.json'"));
assert(dayJs.includes("fetch('/public-live-open-pnl.json'"));
assertParses(dayJs, "Day Trading system-page script");
assert.strictEqual((dayHtml.match(/<\/html>/g) || []).length, 1);

console.log("Chart inline script injection regression PASS");
