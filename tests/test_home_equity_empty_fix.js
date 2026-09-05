"use strict";

const assert = require("assert");
const { STYLE_ID, refineHomeEquityEmptyState } = require("../website_home_equity_empty_fix");

const sample = `<!doctype html><html><head><title>Vixale</title></head><body>
<div id="vx-home-equity-stage"><svg></svg></div>
<div id="vx-home-equity-empty" class="vx-home-equity-empty" hidden>No closed trades with realized P&amp;L are available yet.</div>
</body></html>`;

const out = refineHomeEquityEmptyState(sample, "/");
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes(".vx-home-equity-empty[hidden]{display:none!important}"));
assert(out.includes(".vx-home-equity-empty:not([hidden]){display:block!important"));
assert(out.includes("min-height:0!important"));
assert(out.includes("border:0!important"));
assert.strictEqual(refineHomeEquityEmptyState(out, "/"), out, "refinement must be idempotent");
assert.strictEqual(refineHomeEquityEmptyState(sample, "/pricing"), sample, "non-home pages must remain untouched");

console.log("Homepage equity empty-state cleanup: PASS");
