"use strict";

const assert = require("assert");
const Module = require("module");

const {
  SCRIPT_ID: SNAPSHOT_SCRIPT_ID,
  injectScript: injectSnapshotScript,
} = require("../website_home_system_selector_refinement");

const originalLoad = Module._load;
Module._load = function loadWithGoogleStub(request, parent, isMain) {
  if (request === "googleapis") {
    return {
      google: {
        auth: { GoogleAuth: class GoogleAuth {} },
        sheets: () => ({}),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  SCRIPT_ID: LIVE_PNL_SCRIPT_ID,
  LIVE_OPEN_PNL_PATH,
  injectLiveOpenPnl,
} = require("../website_home_live_open_pnl");
Module._load = originalLoad;

function extractInlineScript(html, id) {
  const pattern = new RegExp(`<script id=["']${id}["']>([\\s\\S]*?)<\\/script>`);
  const match = String(html).match(pattern);
  assert(match, `expected inline script ${id}`);
  return match[1];
}

function count(haystack, needle) {
  return String(haystack).split(needle).length - 1;
}

function assertParses(source, label) {
  assert.doesNotThrow(() => new Function(source), `${label} must remain valid JavaScript after HTML injection`);
}

const snapshotHtml = injectSnapshotScript("<!doctype html><html><head></head><body><main>snapshot</main></body></html>");
const snapshotJs = extractInlineScript(snapshotHtml, SNAPSHOT_SCRIPT_ID);
assert(snapshotJs.includes("text.startsWith('+$')"), "positive money marker must survive emitted HTML unchanged");
assert(snapshotJs.includes("text.startsWith('-$')"), "negative money marker must survive emitted HTML unchanged");
assert(snapshotJs.includes("new MutationObserver(sync)"), "snapshot mirror observer must survive emitted HTML");
assertParses(snapshotJs, "snapshot mirror script");
assert.strictEqual(count(snapshotHtml, "</html>"), 1, "snapshot injection must not splice trailing HTML into the script");

const liveSource = `<!doctype html><html><head></head><body>
<section class="vx-home-day-trading"><div class="wrap">
<section class="vx-home-live-strip-wrap"><div class="vx-home-live-strip">
<div class="vx-home-live-card"><div class="vx-home-live-label">Open Positions</div><div id="vx-home-live-0" class="vx-home-live-value">1</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Pending Setups</div><div id="vx-home-live-1" class="vx-home-live-value">0</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Closed Trades Today</div><div id="vx-home-live-2" class="vx-home-live-value">7</div></div>
<div class="vx-home-live-card"><div class="vx-home-live-label">Closed P&amp;L Today</div><div id="vx-home-live-3" class="vx-home-live-value negative">-$597.08</div></div>
</div></section>
</div></section>
</body></html>`;

const liveHtml = injectLiveOpenPnl(liveSource, "/");
const liveJs = extractInlineScript(liveHtml, LIVE_PNL_SCRIPT_ID);
assert(liveJs.includes("return sign + '$' + Math.abs(n)"), "money formatter must survive emitted HTML unchanged");
assert(liveJs.includes(`fetch('${LIVE_OPEN_PNL_PATH}'`), "live P&L polling endpoint must survive emitted HTML");
assert(liveJs.includes("schedule(100)"), "live P&L polling must start after page load");
assertParses(liveJs, "Live Open P&L script");
assert.strictEqual(count(liveHtml, "</html>"), 1, "Live Open P&L injection must not splice trailing HTML into the script");

console.log("Homepage emitted runtime scripts: PASS");
