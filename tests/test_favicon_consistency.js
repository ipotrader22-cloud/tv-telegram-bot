"use strict";

const assert = require("assert");
const favicon = require("../website_favicon");

assert.strictEqual(favicon.FAVICON_VERSION, "20260927");
assert.deepStrictEqual(favicon.CANONICAL_FAVICON_HREFS, [
  "/favicon.ico?v=20260927",
  "/favicon.png?v=20260927",
  "/apple-touch-icon.png?v=20260927",
]);

const base = '<!doctype html><html><head><title>Vixale</title><link rel="stylesheet" href="/site.css"></head><body><main>PAGE</main></body></html>';
const refined = favicon.injectFaviconLinks(base);
assert(favicon.hasCanonicalFaviconLinks(refined), "canonical favicon links must be present");
assert.strictEqual(favicon.faviconLinkTags(refined).length, 3, "exactly three canonical favicon links are expected");
assert(refined.includes('<link rel="stylesheet" href="/site.css">'), "non-favicon links must remain untouched");
assert.strictEqual(favicon.injectFaviconLinks(refined), refined, "favicon injection must be idempotent");

const legacy = '<!doctype html><html><head><title>Swing</title><link rel="shortcut icon" href="/old.ico"><link rel="apple-touch-icon" href="/old-touch.png"></head><body>SWING</body></html>';
const normalized = favicon.injectFaviconLinks(legacy);
assert(!normalized.includes('/old.ico'), "legacy favicon must be removed");
assert(!normalized.includes('/old-touch.png'), "legacy touch icon must be removed");
assert(favicon.hasCanonicalFaviconLinks(normalized), "legacy pages must receive the canonical favicon set");

let middleware;
const app = { use(fn) { middleware = fn; } };
favicon.installFavicon(app);

const headers = new Map([
  ["content-type", "text/html; charset=utf-8"],
  ["content-length", "1"],
  ["etag", 'W/"old"'],
]);
let ended = null;
const res = {
  statusCode: 200,
  headersSent: false,
  getHeader(name) { return headers.get(String(name).toLowerCase()); },
  setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
  removeHeader(name) { headers.delete(String(name).toLowerCase()); },
  send(body) { ended = body; return this; },
  end(chunk) { ended = chunk; return this; },
};

middleware({ method: "GET", path: "/trading-systems/swing-trading", url: "/trading-systems/swing-trading" }, res, () => {});
res.end(Buffer.from(base, "utf8"));
const bufferedHtml = Buffer.isBuffer(ended) ? ended.toString("utf8") : String(ended);
assert(favicon.hasCanonicalFaviconLinks(bufferedHtml), "Buffer/res.end HTML must receive the canonical favicon set");
assert(!headers.has("etag"), "stale ETag must be removed when end-body HTML changes");
assert.strictEqual(Number(headers.get("content-length")), Buffer.byteLength(bufferedHtml, "utf8"));

for (const [assetPath, expectedType] of [
  ["/favicon.ico", "image/x-icon"],
  ["/favicon.png", "image/png"],
  ["/apple-touch-icon.png", "image/png"],
]) {
  const assetHeaders = new Map();
  let assetBody = null;
  const assetRes = {
    statusCode: 0,
    setHeader(name, value) { assetHeaders.set(String(name).toLowerCase(), value); },
    end(body) { assetBody = body; },
  };
  assert.strictEqual(favicon.serveFaviconAsset({ method: "GET", path: assetPath, url: assetPath }, assetRes), true, `${assetPath} must be served`);
  assert.strictEqual(assetRes.statusCode, 200);
  assert.strictEqual(assetHeaders.get("content-type"), expectedType);
  assert(Buffer.isBuffer(assetBody) && assetBody.length > 0, `${assetPath} must return bytes`);
}

console.log("Favicon consistency regression PASS");
