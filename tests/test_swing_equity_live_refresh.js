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
assert.strictEqual(SOURCE_PATH, "/swing-leaders");
assert.strictEqual(REFRESH_MS, 60 * 1000);
assert.strictEqual(requestPath({ originalUrl: "/trading-systems/swing-trading?x=1" }), SWING_PATH);
assert.strictEqual(requestPath({ url: "/other?x=1" }), "/other");

const fixture = '<!doctype html><html><head></head><body><section class="equity-chart-card"><svg class="equity-chart-svg"></svg></section></body></html>';
const out = injectEquityRefreshScript(fixture);
assert(out.includes(`id="${SCRIPT_ID}"`));
assert(out.includes(`const SOURCE_PATH=${JSON.stringify(SOURCE_PATH)}`));
assert(out.includes(`const REFRESH_MS=${REFRESH_MS}`));
assert(out.includes('fetch(SOURCE_PATH,{credentials:"same-origin",cache:"no-store",headers:{Accept:"text/html"}})'));
assert(out.includes('parsed.querySelector(".equity-chart-card .equity-chart-svg")'));
assert(out.includes('current.replaceWith(document.importNode(fresh,true))'));
assert(out.includes('document.visibilityState==="hidden"'));
assert(out.includes('document.addEventListener("visibilitychange"'));
assert.strictEqual(injectEquityRefreshScript(out), out, "script injection must be idempotent");
assert(equityRefreshScript.includes('fresh.outerHTML!==current.outerHTML'));

console.log("Swing Equity History live refresh: PASS");
