"use strict";

const assert = require("assert");
const systemPages = require("../website_conversion_system_pages_refinement");

function extractInlineScript(html, id) {
  const match = String(html).match(new RegExp(`<script id=["']${id}["']>([\\s\\S]*?)<\\/script>`));
  assert(match, `expected inline script ${id}`);
  return match[1];
}

const base = "<!doctype html><html><head></head><body><main>fixture</main></body></html>";
const main = systemPages.renderDayMain();

assert(main.includes('class="vx-conversion-day-chart-heading"'));
assert(main.includes("REALIZED P&amp;L HISTORY"));
assert(main.includes("Realized P&amp;L"));
assert(main.includes('id="vx-day-chart"'));
assert(main.includes('viewBox="0 0 720 230"'));

const html = systemPages.refineSystemPage(base, systemPages.DAY_PATH);
const script = extractInlineScript(html, systemPages.DAY_SCRIPT_ID);

assert.doesNotThrow(() => new Function(script), "Dedicated Day Trading chart script must parse after HTML injection");
assert(script.includes("axisMoney"));
assert(script.includes("const ticks=5"));
assert(script.includes("cumulative_pnl"));
assert(script.includes("x&&x.date"));
assert(script.includes("lo<=0&&hi>=0"));
assert(script.includes("rows.length<=24"));
assert(script.includes("cache:'no-store'"));
assert(script.includes("fetch('/public-performance.json'"));
assert(script.includes("fetch('/public-live-open-pnl.json'"));
assert(!script.includes("total_model_pnl"));

assert(html.includes(".vx-conversion-day-chart-legend"));
assert(html.includes("height:230px"));
assert(html.includes("height:210px"));

console.log("Dedicated Day Trading chart presentation: PASS");