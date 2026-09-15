"use strict";

const Module = require("module");
const fs = require("fs");
const path = require("path");

const SWING_PATH = "/trading-systems/swing-trading";
const GUIDE_PATH = "/trading-guide";
const SYSTEMS_PATH = "/trading-systems";
const VIDEO_ROUTE = "/assets/swing-trading/how-to-follow-vixale-swing-trading.mp4";
const CAPTIONS_ROUTE = "/assets/swing-trading/how-to-follow-vixale-swing-trading.en.vtt";
const POSTER_ROUTE = "/assets/swing-trading/how-to-follow-vixale-swing-trading-poster.jpg";
const ASSET_DIR = path.join(__dirname, "assets", "swing-trading");
const VIDEO_PART_PREFIX = "how-to-follow-vixale-swing-trading.mp4.b64.part";
const POSTER_BASE64_PATH = path.join(ASSET_DIR, "how-to-follow-vixale-swing-trading-poster.jpg.b64");
const CAPTIONS_PATH = path.join(ASSET_DIR, "how-to-follow-vixale-swing-trading.en.vtt");
const STYLE_ID = "vx-swing-instructional-video-style";
const CARD_MARKER = 'class="vx-swing-instructional-video"';
const REVIEW_WINDOW = "10:00–11:00 AM ET";

let cachedVideoBuffer = null;
let cachedPosterBuffer = null;
let cachedCaptions = null;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function readBase64Parts(prefix) {
  const names = fs.readdirSync(ASSET_DIR)
    .filter(name => name.startsWith(prefix))
    .sort();
  if (!names.length) throw new Error(`Missing media source parts for ${prefix}`);
  return names.map(name => fs.readFileSync(path.join(ASSET_DIR, name), "utf8").trim()).join("");
}

function readVideoBuffer() {
  if (cachedVideoBuffer) return cachedVideoBuffer;
  const buffer = Buffer.from(readBase64Parts(VIDEO_PART_PREFIX), "base64");
  if (buffer.length < 500000 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Invalid Swing instructional MP4 source");
  }
  cachedVideoBuffer = buffer;
  return cachedVideoBuffer;
}

function readPosterBuffer() {
  if (cachedPosterBuffer) return cachedPosterBuffer;
  const encoded = fs.readFileSync(POSTER_BASE64_PATH, "utf8").trim();
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 1000 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Invalid Swing instructional poster source");
  }
  cachedPosterBuffer = buffer;
  return cachedPosterBuffer;
}

function readCaptions() {
  if (cachedCaptions !== null) return cachedCaptions;
  const text = fs.readFileSync(CAPTIONS_PATH, "utf8");
  if (!text.startsWith("WEBVTT")) throw new Error("Invalid Swing instructional captions source");
  cachedCaptions = text;
  return cachedCaptions;
}

function parseByteRange(value, size) {
  const match = String(value || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start;
  let end;
  if (!match[1] && !match[2]) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function sendBinary(req, res, buffer, contentType, { allowRange = false } = {}) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  if (allowRange) res.setHeader("Accept-Ranges", "bytes");

  const rangeHeader = allowRange ? req.headers?.range : null;
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, buffer.length);
    if (!range) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${buffer.length}`);
      res.end();
      return;
    }
    const chunk = buffer.subarray(range.start, range.end + 1);
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${buffer.length}`);
    res.setHeader("Content-Length", String(chunk.length));
    if (req.method === "HEAD") res.end();
    else res.end(chunk);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Length", String(buffer.length));
  if (req.method === "HEAD") res.end();
  else res.end(buffer);
}

function serveSwingMedia(req, res, next) {
  const pathname = requestPath(req);
  const isRead = req.method === "GET" || req.method === "HEAD";
  if (!isRead) return false;
  try {
    if (pathname === VIDEO_ROUTE) {
      sendBinary(req, res, readVideoBuffer(), "video/mp4", { allowRange: true });
      return true;
    }
    if (pathname === POSTER_ROUTE) {
      sendBinary(req, res, readPosterBuffer(), "image/jpeg");
      return true;
    }
    if (pathname === CAPTIONS_ROUTE) {
      const captions = readCaptions();
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Content-Length", String(Buffer.byteLength(captions)));
      if (req.method === "HEAD") res.end();
      else res.end(captions);
      return true;
    }
  } catch (error) {
    next(error);
    return true;
  }
  return false;
}

const videoStyles = `<style id="${STYLE_ID}">
  .vx-swing-instructional-video{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe8e3;border-radius:24px;background:linear-gradient(145deg,#fff,#f5faf7);box-shadow:0 18px 52px rgba(16,23,19,.06)}
  .vx-swing-video-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:16px}
  .vx-swing-video-kicker{display:block;margin-bottom:7px;color:#087a48;font-size:10.5px;font-weight:700;letter-spacing:.075em;text-transform:uppercase}
  .vx-swing-video-head h2{margin:0;color:#101713;font-size:24px;font-weight:600;letter-spacing:-.035em}
  .vx-swing-video-head p{max-width:610px;margin:7px 0 0;color:#68756e;font-size:13px;line-height:1.55}
  .vx-swing-video-window{flex:0 0 auto;padding:7px 10px;border:1px solid #cfe3d8;border-radius:999px;background:#f5fbf7;color:#176442;font-size:11px;font-weight:700;white-space:nowrap}
  .vx-swing-video-frame{overflow:hidden;border:1px solid #d7e4dd;border-radius:18px;background:#0f1d17;box-shadow:0 12px 34px rgba(16,23,19,.08)}
  .vx-swing-video-frame video{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#0f1d17}
  .vx-swing-video-note{margin:12px 0 0;color:#748079;font-size:11.5px;line-height:1.55}
  @media(max-width:720px){.vx-swing-instructional-video{padding:18px 16px;border-radius:20px}.vx-swing-video-head{align-items:flex-start;flex-direction:column;gap:11px}.vx-swing-video-head h2{font-size:21px}.vx-swing-video-window{white-space:normal}.vx-swing-video-frame{border-radius:14px}}
</style>`;

function renderVideoCard() {
  return `<section class="vx-swing-instructional-video" aria-labelledby="vx-swing-video-title">
    <div class="vx-swing-video-head">
      <div><span class="vx-swing-video-kicker">Beginner walkthrough</span><h2 id="vx-swing-video-title">How to Follow Vixale Swing Trading</h2><p>A beginner-friendly walkthrough of portfolio updates, entries, targets, stops, and research-driven exits.</p></div>
      <span class="vx-swing-video-window">Daily update · ${REVIEW_WINDOW}</span>
    </div>
    <div class="vx-swing-video-frame">
      <video controls preload="metadata" playsinline poster="${POSTER_ROUTE}" aria-labelledby="vx-swing-video-title">
        <source src="${VIDEO_ROUTE}" type="video/mp4" />
        <track kind="captions" src="${CAPTIONS_ROUTE}" srclang="en" label="English" default />
        Your browser does not support HTML5 video. <a href="${VIDEO_ROUTE}">Open the Swing Trading walkthrough.</a>
      </video>
    </div>
    <p class="vx-swing-video-note">Potential Candidates are watch-only research ideas. Active Portfolio additions and removals are the actionable portfolio updates. The +10% target may fill intraday; the -5% stop reference is checked during the scheduled morning review and is not an automatic intraday stop order.</p>
  </section>`;
}

function injectVideoStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${videoStyles}\n</head>`) : html;
}

function injectVideoCard(html) {
  if (typeof html !== "string" || html.includes(CARD_MARKER)) return html;
  const anchor = '<section class="how" aria-label="How Swing Leaders works">';
  if (!html.includes(anchor)) return html;
  return html.replace(anchor, `${renderVideoCard()}\n\n    ${anchor}`);
}

function alignSwingPublicCopy(html) {
  if (typeof html !== "string") return html;
  let out = html;
  const replacements = [
    ["Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.", `The Swing Trading portfolio is updated once per trading day during the ${REVIEW_WINDOW} window. Review Active Portfolio after the update for additions and removals.`],
    ["Check for updates each trading morning from 9:45–10:00 AM ET.", `The portfolio is updated once per trading day during ${REVIEW_WINDOW}; review additions and removals after publication.`],
    ["Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.", `Active Portfolio at ${REVIEW_WINDOW} → additions/removals → +10% GTC target → scheduled morning stop check.`],
    ["Check 9:45–10:00 AM ET", `Check ${REVIEW_WINDOW}`],
    ["Use a +10% target and a -5% stop from your actual entry price.", "From your actual entry price, place the +10% profit target as a GTC sell limit. Treat 5% below entry as a morning-review stop reference, not an automatic intraday stop order."],
    ["From your actual entry price, use a +10% profit target and a -5% stop.", "From your actual entry price, place the +10% profit target as a GTC sell limit. Treat 5% below entry as a morning-review stop reference, not an automatic intraday stop order."],
    ["5% stop level, evaluated on the daily close.", "5% below actual entry, evaluated only during the scheduled morning review; not an intraday stop order."],
    ["9:45–10:00 AM ET", REVIEW_WINDOW],
    ["9:45-10:00 AM ET", "10:00-11:00 AM ET"],
  ];
  for (const [from, to] of replacements) out = out.split(from).join(to);

  out = out.split("When a new symbol appears, enter at the current market price.").join("When a new symbol appears in Active Portfolio, act on the addition as soon as practical and record your actual fill price.");
  out = out.split("If the symbol drops off Active Portfolio, close at market as soon as practical.").join("If the symbol is removed from Active Portfolio, close at market as soon as practical; do not wait for the original target or stop.");
  out = out.split("A portfolio removal is an exit instruction. Actual market fills can differ from the example price.").join("A portfolio removal is an independent exit instruction. Actual market fills can differ from the example price; the +10% target may execute intraday, while the -5% stop reference is evaluated only during the scheduled morning review.");
  return out;
}

function refineSwingInstructionalHtml(html, pathname) {
  if (typeof html !== "string") return html;
  let out = html;
  if (pathname === SWING_PATH || pathname === GUIDE_PATH || pathname === SYSTEMS_PATH) {
    out = alignSwingPublicCopy(out);
  }
  if (pathname === SWING_PATH) {
    out = injectVideoStyles(out);
    out = injectVideoCard(out);
  }
  return out;
}

function installSwingInstructionalRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    if (serveSwingMedia(req, res, next)) return;

    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || ![SWING_PATH, GUIDE_PATH, SYSTEMS_PATH].includes(pathname)) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingInstructional(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineSwingInstructionalHtml(body, pathname);
      }
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleSwingInstructionalWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installSwingInstructionalRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleSwingInstructionalWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingInstructionalModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  GUIDE_PATH,
  SYSTEMS_PATH,
  VIDEO_ROUTE,
  CAPTIONS_ROUTE,
  POSTER_ROUTE,
  REVIEW_WINDOW,
  STYLE_ID,
  CARD_MARKER,
  requestPath,
  readVideoBuffer,
  readPosterBuffer,
  readCaptions,
  parseByteRange,
  renderVideoCard,
  injectVideoStyles,
  injectVideoCard,
  alignSwingPublicCopy,
  refineSwingInstructionalHtml,
  installSwingInstructionalRefinement,
  wrapExpress,
};
