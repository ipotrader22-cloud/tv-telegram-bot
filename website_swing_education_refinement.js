"use strict";

const Module = require("module");
const path = require("path");

const GUIDE_PATH = "/trading-guide";
const CANONICAL_SWING_PATH = "/trading-systems/swing-trading";
const LEGACY_SWING_PATH = "/swing-leaders";
const VIDEO_PATH = "/media/swing/how-to-follow-vixale-swing-trading.mp4";
const POSTER_PATH = "/media/swing/how-to-follow-vixale-swing-trading-poster.jpg";
const CAPTIONS_PATH = "/media/swing/how-to-follow-vixale-swing-trading.en.vtt";
const VIDEO_FILE = path.join(__dirname, "media", "swing", "how-to-follow-vixale-swing-trading.mp4");
const POSTER_FILE = path.join(__dirname, "media", "swing", "how-to-follow-vixale-swing-trading-poster.jpg");
const CAPTIONS_FILE = path.join(__dirname, "media", "swing", "how-to-follow-vixale-swing-trading.en.vtt");
const VIDEO_MARKER = 'id="vx-swing-instructional-video"';
const STYLE_MARKER = "vx-swing-education-style";

const educationStyles = `<style id="${STYLE_MARKER}">
  .vx-swing-video-card{margin:0 0 24px;padding:22px 24px;border:1px solid var(--line,#dfe8e3);border-radius:24px;background:#fff;box-shadow:var(--shadow,0 18px 52px rgba(16,23,19,.07))}
  .vx-swing-video-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:16px}
  .vx-swing-video-head>div{max-width:760px}.vx-swing-video-kicker{display:block;margin-bottom:7px;color:var(--green,#087a48);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .vx-swing-video-head h2{margin:0;font-size:24px;font-weight:600;letter-spacing:-.03em}.vx-swing-video-head p{margin:7px 0 0;color:var(--muted,#68756e);font-size:13px;line-height:1.55}
  .vx-swing-video-frame{overflow:hidden;border:1px solid #dfe8e3;border-radius:18px;background:#101713;aspect-ratio:16/9}.vx-swing-video-frame video{display:block;width:100%;height:100%;object-fit:contain;background:#101713}
  .vx-swing-video-note{margin:12px 0 0;color:var(--muted,#68756e);font-size:11.5px;line-height:1.55}
  @media(max-width:720px){.vx-swing-video-card{padding:16px;border-radius:20px}.vx-swing-video-head{align-items:flex-start;flex-direction:column;gap:8px}.vx-swing-video-head h2{font-size:21px}.vx-swing-video-frame{border-radius:14px}}
</style>`;

function renderSwingInstructionalVideo() {
  return `<section class="vx-swing-video-card" id="vx-swing-instructional-video" aria-labelledby="vx-swing-video-title">
    <div class="vx-swing-video-head"><div><span class="vx-swing-video-kicker">Beginner walkthrough</span><h2 id="vx-swing-video-title">How to Follow Vixale Swing Trading</h2><p>A beginner-friendly walkthrough of portfolio updates, entries, targets, stops, and research-driven exits.</p></div></div>
    <div class="vx-swing-video-frame"><video controls playsinline preload="metadata" poster="${POSTER_PATH}" aria-label="How to Follow Vixale Swing Trading instructional video"><source src="${VIDEO_PATH}" type="video/mp4"><track kind="captions" srclang="en" label="English" src="${CAPTIONS_PATH}" default>Your browser does not support HTML video.</video></div>
    <p class="vx-swing-video-note">Vixale Swing Trading is a research and model-portfolio system. Examples are educational. Actual fills and execution prices may differ. Trading involves risk.</p>
  </section>`;
}

function injectSwingVideo(html) {
  if (typeof html !== "string" || html.includes(VIDEO_MARKER)) return html;
  const anchor = '<section class="how" aria-label="How Swing Leaders works">';
  if (!html.includes(anchor)) return html;
  let out = html.replace(anchor, `${renderSwingInstructionalVideo()}\n\n    ${anchor}`);
  if (!out.includes(`id="${STYLE_MARKER}"`) && out.includes("</head>")) out = out.replace("</head>", `${educationStyles}\n</head>`);
  return out;
}

function refineSwingGuideHtml(html) {
  if (typeof html !== "string") return html;
  let out = html;
  const replacements = [
    ["Check 9:45–10:00 AM ET", "Check 10:00–11:00 AM ET"],
    ["Review Active Portfolio each trading day for updates.", "Review the once-daily Active Portfolio update during the 10:00–11:00 AM ET window, then act on additions or removals as soon as practical."],
    ["Use a +10% target and a -5% stop from your actual entry price.", "Use a +10% target from your actual entry price. The -5% level is checked during the scheduled morning review and is not an automatic intraday stop order."],
    ["Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.", "The Swing Trading portfolio is updated once per trading day during the 10:00–11:00 AM ET window. Review additions and removals after the update and act as soon as practical."],
    ["Open the Swing Trading section and review Active Portfolio for additions or removals.", "Open the Swing Trading section after the once-daily 10:00–11:00 AM ET update and review Active Portfolio for additions or removals."],
    ["From your actual entry price, use a +10% profit target and a -5% stop.", "From your actual entry price, place the +10% profit target; it may fill intraday. During the scheduled morning review, close at market as soon as practical if price is more than 5% below entry."],
    ["Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.", "Active Portfolio update at 10:00–11:00 AM ET → additions → +10% intraday-capable target → morning -5% review → close removals."],
  ];
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out;
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function sendAsset(res, file, type, next) {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.type(type);
  res.sendFile(file, error => { if (error && !res.headersSent) next(error); });
}

function installSwingEducationRefinement(app) {
  app.use((req, res, next) => {
    const route = requestPath(req);
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    if (route === VIDEO_PATH) return sendAsset(res, VIDEO_FILE, "video/mp4", next);
    if (route === POSTER_PATH) return sendAsset(res, POSTER_FILE, "image/jpeg", next);
    if (route === CAPTIONS_PATH) return sendAsset(res, CAPTIONS_FILE, "text/vtt; charset=utf-8", next);

    if (route === GUIDE_PATH || route === CANONICAL_SWING_PATH || route === LEGACY_SWING_PATH) {
      const send = res.send.bind(res);
      res.send = function sendSwingEducation(body) {
        const contentType = String(res.getHeader?.("Content-Type") || "");
        if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
          if (route === GUIDE_PATH) body = refineSwingGuideHtml(body);
          else body = injectSwingVideo(body);
        }
        return send(body);
      };
    }
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleSwingEducationWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installSwingEducationRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleSwingEducationWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingEducationModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  GUIDE_PATH,
  CANONICAL_SWING_PATH,
  LEGACY_SWING_PATH,
  VIDEO_PATH,
  POSTER_PATH,
  CAPTIONS_PATH,
  VIDEO_MARKER,
  STYLE_MARKER,
  renderSwingInstructionalVideo,
  injectSwingVideo,
  refineSwingGuideHtml,
  installSwingEducationRefinement,
  wrapExpress,
};
