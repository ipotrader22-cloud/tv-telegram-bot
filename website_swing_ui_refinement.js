"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const STYLE_ID = "vx-swing-ui-refinement-style";
const PAGE_MARKER = 'data-vx-swing-ui-refinement="1"';

const styles = `<style id="${STYLE_ID}">
[data-vx-conversion-system-page="swing"] .hero h1{font-size:clamp(30px,3.5vw,42px)!important;font-weight:550!important;line-height:1.06!important;letter-spacing:-.035em!important}
.vx-swing-how-card{align-self:stretch}.vx-swing-how-card h2{margin:0 0 16px;font-size:33px;line-height:1.08;letter-spacing:-.03em;font-weight:600}.vx-swing-how-list{display:grid;gap:14px}.vx-swing-how-list p{margin:0;color:#5f6d67;font-size:18px;line-height:1.5}.vx-swing-how-list strong{display:block;margin-bottom:4px;color:#17211d;font-size:19.5px!important;line-height:1.3;font-weight:650!important;letter-spacing:-.01em!important}.vx-swing-market-posture h2{margin-bottom:10px}.vx-swing-posture-copy{margin:0;color:#17211d;font-size:24px;line-height:1.45;font-weight:600;letter-spacing:-.02em}
@media(max-width:1000px){.vx-swing-how-card{grid-column:1/-1}}@media(max-width:720px){.vx-swing-how-card h2{font-size:30px}.vx-swing-how-list p{font-size:17px}.vx-swing-how-list strong{font-size:18.5px!important}.vx-swing-posture-copy{font-size:21px}}
</style>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>")
    ? html.replace("</head>", () => `${styles}\n</head>`)
    : `${styles}${html}`;
}

function renderHowSummaryCard() {
  return `<div class="summary-card posture vx-swing-how-card" data-vx-swing-how="beginner">
          <h2>How Swing Leaders Works</h2>
          <div class="vx-swing-how-list">
            <p><strong>Active Portfolio</strong>Stocks that are currently in the model portfolio. These are the positions being monitored for the profit target, the scheduled morning stop check, and any Trading Lab removal.</p>
            <p><strong>Potential Candidates</strong>Stocks being watched for a possible future addition. They are not open positions and may never be added.</p>
            <p><strong>Closed Trades</strong>Positions that have left the model portfolio. This section shows the final model return and the recorded reason for exit.</p>
            <p><strong>Position size and exits</strong>Each model position uses a fixed $10,000 allocation. A +10% target may fill during the day. The 5% stop reference is checked during the scheduled morning review, not as an automatic intraday stop. Trading Lab can also remove a position from Active Portfolio.</p>
          </div>
        </div>`;
}

function renderMarketPosture(postureHtml) {
  return `<section class="how vx-swing-market-posture" aria-label="Market Posture" data-vx-swing-market-posture="1">
      <h2>Market Posture</h2>
      <p class="vx-swing-posture-copy">${postureHtml}</p>
    </section>`;
}

function removeSwingEvidenceContext(html) {
  return String(html).replace(
    /\s*<section\b[^>]*class=["'][^"']*\bvx-evidence-context\b[^"']*["'][^>]*data-vx-evidence-credibility=["']swing["'][^>]*>[\s\S]*?<\/section>\s*/i,
    "\n"
  );
}

function refineSwingHtml(html) {
  if (typeof html !== "string" || html.includes(PAGE_MARKER)) return html;
  let out = removeSwingEvidenceContext(html);

  out = out.replace(
    /<small>Model Allocation<\/small><strong>\$10K<\/strong><span>per position<\/span>/i,
    () => '<small>Model Allocation</small><strong>$10K / position</strong>'
  );

  const posture = out.match(/<div\b[^>]*class=["'][^"']*\bsummary-card\b[^"']*\bposture\b[^"']*["'][^>]*>\s*<small>Market Posture<\/small>\s*<strong>([\s\S]*?)<\/strong>\s*<\/div>/i);
  const how = out.match(/<section\b[^>]*class=["'][^"']*\bhow\b[^"']*["'][^>]*aria-label=["']How Swing Leaders works["'][^>]*>[\s\S]*?<\/section>/i);

  if (posture && how) {
    out = out.replace(posture[0], () => renderHowSummaryCard());
    out = out.replace(how[0], () => renderMarketPosture(posture[1]));
  }

  out = injectStyles(out);
  return out.replace(/<body(\s[^>]*)?>/i, match => (
    match.includes(PAGE_MARKER)
      ? match
      : match.replace("<body", `<body ${PAGE_MARKER}`)
  ));
}

function installSwingUiRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || pathname !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingUi(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineSwingHtml(body);
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
  if (typeof factory !== "function" || factory.__vixaleSwingUiWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingUiRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingUiWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingUiModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  STYLE_ID,
  PAGE_MARKER,
  requestPath,
  injectStyles,
  renderHowSummaryCard,
  renderMarketPosture,
  removeSwingEvidenceContext,
  refineSwingHtml,
  installSwingUiRefinement,
  wrapExpress,
};
