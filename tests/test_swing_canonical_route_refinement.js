"use strict";

const assert = require("assert");
const packageJson = require("../package.json");
const {
  CANONICAL_SWING_PATH,
  LEGACY_SWING_PATH,
  CANONICAL_SWING_URL,
  PAGE_MARKER,
  refineCanonicalSwingHtml,
  installSwingCanonicalRefinement,
} = require("../website_swing_canonical_refinement");

const startCommand = packageJson.scripts.start;
assert(
  startCommand.indexOf("-r ./website_swing_canonical_refinement.js") < startCommand.indexOf("-r ./website_trading_systems_product_refinement.js"),
  "Swing canonical refinement must load before the Trading Systems product refinement"
);

function captureMiddleware() {
  let middleware = null;
  installSwingCanonicalRefinement({
    use(fn) { middleware = fn; },
  });
  assert.strictEqual(typeof middleware, "function");
  return middleware;
}

function responseHarness() {
  return {
    redirectArgs: null,
    sent: null,
    getHeader() { return "text/html; charset=utf-8"; },
    redirect(status, location) {
      this.redirectArgs = [status, location];
      return this;
    },
    send(body) {
      this.sent = body;
      return this;
    },
  };
}

const html = `<!doctype html><html><head><title>Vixale Swing Leaders</title></head><body>
<div class="eyebrow">Swing Trading · Research</div>
<h1>Vixale Swing Leaders</h1>
<p class="hero-copy">A research/model portfolio focused on actively monitored swing positions and potential future candidates from Vixale Trading Lab.</p>
</body></html>`;

const refined = refineCanonicalSwingHtml(html);
assert(refined.includes(PAGE_MARKER));
assert(refined.includes("<title>Vixale | Swing Trading</title>"));
assert(refined.includes(`<link rel="canonical" href="${CANONICAL_SWING_URL}" />`));
assert(refined.includes("Swing Trading · Swing Leaders"));
assert(refined.includes("<h1>Vixale Swing Trading</h1>"));
assert(refined.includes("Swing Leaders research/model portfolio"));
assert.strictEqual(refineCanonicalSwingHtml(refined), refined, "HTML transform must be idempotent");

{
  const middleware = captureMiddleware();
  const req = { method: "GET", path: CANONICAL_SWING_PATH, url: `${CANONICAL_SWING_PATH}?view=full`, _parsedUrl: {} };
  const res = responseHarness();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });
  assert.strictEqual(nextCalls, 1);
  assert.strictEqual(req.url, `${LEGACY_SWING_PATH}?view=full`, "canonical page must reuse the existing Swing Leaders handler");
  assert(!Object.prototype.hasOwnProperty.call(req, "_parsedUrl"), "parsed URL cache must be cleared after internal rewrite");
  res.send(html);
  assert(res.sent.includes(PAGE_MARKER));
  assert(res.sent.includes(CANONICAL_SWING_URL));
}

{
  const middleware = captureMiddleware();
  const req = { method: "HEAD", path: LEGACY_SWING_PATH, url: `${LEGACY_SWING_PATH}?view=full` };
  const res = responseHarness();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });
  assert.deepStrictEqual(res.redirectArgs, [301, `${CANONICAL_SWING_PATH}?view=full`]);
  assert.strictEqual(nextCalls, 0, "legacy Swing page must redirect before the old page handler");
}

{
  const middleware = captureMiddleware();
  const req = { method: "GET", path: "/api/swing-leaders", url: "/api/swing-leaders" };
  const res = responseHarness();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });
  assert.strictEqual(nextCalls, 1, "sanitized Swing API must remain untouched");
  assert.strictEqual(req.url, "/api/swing-leaders");
}

{
  const middleware = captureMiddleware();
  const req = { method: "POST", path: LEGACY_SWING_PATH, url: LEGACY_SWING_PATH };
  const res = responseHarness();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });
  assert.strictEqual(nextCalls, 1, "non-read methods must remain untouched");
  assert.strictEqual(res.redirectArgs, null);
}

console.log("Swing canonical route consolidation: PASS");
