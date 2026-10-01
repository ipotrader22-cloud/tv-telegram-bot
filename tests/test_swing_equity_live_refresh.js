"use strict";

const assert = require("assert");
const {
  SWING_PATH,
  SOURCE_PATH,
  REFRESH_MS,
  SCRIPT_ID,
  equityRefreshScript,
  requestPath,
  injectEquityRefreshScript,
} = require("../website_swing_equity_live_refresh");

assert.strictEqual(SWING_PATH, "/trading-systems/swing-trading");
assert.strictEqual(SOURCE_PATH, SWING_PATH);
assert.strictEqual(REFRESH_MS, 60 * 1000);
assert.strictEqual(requestPath({ originalUrl: "/trading-systems/swing-trading?x=1" }), SWING_PATH);
assert.strictEqual(requestPath({ url: "/other?x=1" }), "/other");

const fixture = '<!doctype html><html><head></head><body><main class="wrap"><section class="equity-chart-card"><svg class="equity-chart-svg"></svg></section></main><footer class="footer"><div class="wrap">Vixale Swing Leaders · Last Updated 2026-09-30 10:00 ET</div></footer></body></html>';
const out = injectEquityRefreshScript(fixture);
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(out.includes(`const SOURCE_PATH=${JSON.stringify(SOURCE_PATH)}`));
assert(out.includes(`const REFRESH_MS=${REFRESH_MS}`));
assert(out.includes('"vx_snapshot_refresh="+Date.now()'));
assert(out.includes('cache:"no-store"'));
assert(out.includes('"Cache-Control":"no-cache"'));
assert(out.includes('const signature=root=>'));
assert(out.includes('main table tbody tr td:first-child strong'));
assert(out.includes('currentMain.replaceWith(document.importNode(freshMain,true))'));
assert(out.includes('currentFooter.replaceWith(document.importNode(freshFooter,true))'));
assert(out.includes('if(!replaceSnapshot(parsed))refreshChart(parsed)'));
assert(out.includes('document.visibilityState==="hidden"'));
assert(out.includes('document.addEventListener("visibilitychange"'));
assert.strictEqual(injectEquityRefreshScript(out), out, "script injection must be idempotent");
assert(equityRefreshScript.includes('fresh.outerHTML!==current.outerHTML'));

console.log("Swing full snapshot live refresh: PASS");
