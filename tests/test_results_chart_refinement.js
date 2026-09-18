"use strict";

const assert = require("assert");
const results = require("../website_conversion_results_refinement");

function extractInlineScript(html, id) {
  const match = String(html).match(new RegExp(`<script id=["']${id}["']>([\\s\\S]*?)<\\/script>`));
  assert(match, `expected inline script ${id}`);
  return match[1];
}

const base = "<!doctype html><html><head></head><body><main>fixture</main></body></html>";
const main = results.renderResultsMain();
assert(main.includes('id="vx-results-day-chart"'));
assert(main.includes('id="vx-results-swing-chart"'));
assert(main.includes("Realized P&amp;L"));
assert(main.includes("Model P&amp;L"));
assert(main.includes("<span>Candidates</span>"));
assert(!main.includes("<span>Potential Candidates</span>"));

const html = results.refineResults(base);
const script = extractInlineScript(html, results.SCRIPT_ID);
assert.doesNotThrow(() => new Function(script), "Results inline chart script must parse after HTML injection");
assert(script.includes("axisMoney"));
assert(script.includes("const ticks=5"));
assert(script.includes("'cumulative_pnl'"));
assert(script.includes("'total_model_pnl'"));
assert(script.includes("renderPnlChart('vx-results-day-chart'"));
assert(script.includes("renderPnlChart('vx-results-swing-chart'"));
assert(script.includes("snapshot_date"));
assert(script.includes("cache:'no-store'"));
assert(html.includes("vx-results-chart-legend"));
assert(html.includes("viewBox=\"0 0 720 230\""));

console.log("Results chart refinement: PASS");
