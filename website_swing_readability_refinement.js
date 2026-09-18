"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const STYLE_ID = "vx-swing-readability-style";
const EVIDENCE_MARKER = 'data-vx-evidence-credibility="swing"';

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0];
}

const styles = `<style id="${STYLE_ID}">
[data-vx-conversion-system-page="swing"] .hero h1{font-size:clamp(30px,3.5vw,42px)!important;font-weight:550!important;line-height:1.06!important;letter-spacing:-.035em!important;max-width:720px!important}
.summary{grid-template-columns:minmax(420px,2.2fr) repeat(4,minmax(115px,.55fr))!important}
.summary-card.vx-swing-how-card{padding:24px;min-width:0}
.vx-swing-how-card h2{margin:0;color:#17211d;font-size:33px;font-weight:600;line-height:1.08;letter-spacing:-.035em}
.vx-swing-how-list{display:grid;gap:12px;margin-top:16px}
.vx-swing-how-item{margin:0;color:#53615a;font-size:18px;line-height:1.5}
.vx-swing-how-item strong{font-size:19.5px;font-weight:700;letter-spacing:-.01em}
.vx-swing-rule-note{margin:16px 0 0;padding-top:16px;border-top:1px solid #e2ebe6;color:#46534c;font-size:18px;line-height:1.5}
.vx-swing-market-posture{margin:0 0 24px;padding:22px 24px;border:1px solid #dfe8e3;border-radius:24px;background:#fff;box-shadow:0 18px 52px rgba(16,23,19,.07)}
.vx-swing-market-posture small{display:block;color:#68756e;font-size:11px;letter-spacing:.055em;text-transform:uppercase;margin-bottom:9px}
.vx-swing-market-posture strong{display:block;color:#17211d;font-size:22px;font-weight:600;line-height:1.45;letter-spacing:-.015em}
@media(max-width:1000px){.summary{grid-template-columns:1fr 1fr!important}.summary-card.vx-swing-how-card{grid-column:1/-1}}
@media(max-width:720px){.summary{grid-template-columns:1fr!important}.summary-card.vx-swing-how-card{grid-column:auto}.vx-swing-how-card h2{font-size:30px}.vx-swing-how-item,.vx-swing-rule-note{font-size:17px}.vx-swing-how-item strong{font-size:18px}}
</style>`;

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function removeSwingEvidenceContext(html) {
  if (typeof html !== "string") return html;
  if (!html.includes(EVIDENCE_MARKER) && !html.includes("Swing evidence context")) return html;
  return html.replace(/<section class="vx-evidence-context"[^>]*data-vx-evidence-credibility="swing"[^>]*>[\s\S]*?<\/section>\s*/i, "");
}

function renderBeginnerHowCard() {
  return `<div class="summary-card vx-swing-how-card" data-vx-swing-how="beginner">
          <h2>How Swing Leaders Works</h2>
          <div class="vx-swing-how-list">
            <p class="vx-swing-how-item"><strong>Active Portfolio:</strong> these are the model positions currently being followed. This is the main list to check after each daily update.</p>
            <p class="vx-swing-how-item"><strong>Potential Candidates:</strong> these are stocks being researched. They are watch-list ideas, not model positions unless they later move into Active Portfolio.</p>
            <p class="vx-swing-how-item"><strong>Closed Trades:</strong> these are model positions that have finished, with their final return and recorded exit reason.</p>
          </div>
          <p class="vx-swing-rule-note"><strong>Position rules:</strong> each model position starts with a $10,000 allocation. The +10% profit target may trigger intraday. The 5% downside check is evaluated only during the scheduled morning review; it is not a live intraday stop. If Trading Lab removes a symbol from Active Portfolio, that removal is also an exit instruction. Research Score is Vixale’s 0–100 research metric.</p>
        </div>`;
}

function renderMarketPosturePanel(postureHtml) {
  return `<section class="vx-swing-market-posture" aria-label="Market Posture" data-vx-swing-market-posture="1"><small>Market Posture</small><strong>${postureHtml}</strong></section>`;
}

function refineSwingReadability(html) {
  if (typeof html !== "string") return html;
  let out = removeSwingEvidenceContext(html);

  out = out.replace(
    /<div class="summary-card"><small>Model Allocation<\/small><strong>\$10K<\/strong><span>per position<\/span><\/div>/i,
    '<div class="summary-card"><small>Model Allocation</small><strong>$10K / position</strong></div>'
  );

  const posturePattern = /<div class="summary-card posture"><small>Market Posture<\/small><strong>([\s\S]*?)<\/strong><\/div>/i;
  const howPattern = /<section class="how" aria-label="How Swing Leaders works">[\s\S]*?<\/section>/i;
  const postureMatch = out.match(posturePattern);
  const howMatch = out.match(howPattern);

  if (postureMatch && howMatch) {
    const postureHtml = postureMatch[1];
    out = out.replace(posturePattern, renderBeginnerHowCard());
    out = out.replace(howPattern, renderMarketPosturePanel(postureHtml));
  }

  return injectStyles(out);
}

function installSwingReadabilityRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || pathname !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingReadability(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineSwingReadability(body);
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
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleSwingReadabilityWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingReadabilityRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingReadabilityWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingReadabilityModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  STYLE_ID,
  EVIDENCE_MARKER,
  requestPath,
  injectStyles,
  removeSwingEvidenceContext,
  renderBeginnerHowCard,
  renderMarketPosturePanel,
  refineSwingReadability,
  installSwingReadabilityRefinement,
  wrapExpress,
};
