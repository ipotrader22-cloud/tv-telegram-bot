"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const STYLE_ID = "vx-swing-ui-refinement-style";
const PAGE_MARKER = 'data-vx-swing-ui-refinement="1"';

const styles = `<style id="${STYLE_ID}">
[data-vx-conversion-system-page="swing"] .hero h1{font-size:clamp(30px,3.5vw,42px)!important;font-weight:550!important;line-height:1.06!important;letter-spacing:-.035em!important}
.vx-swing-how-block{grid-column:1/-1;width:100%;box-sizing:border-box}.vx-swing-how-block h2{margin:0 0 18px;font-size:33px;line-height:1.08;letter-spacing:-.03em;font-weight:600}.vx-swing-how-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}.vx-swing-how-list p{margin:0;color:#5f6d67;font-size:18px;line-height:1.5}.vx-swing-how-list strong{display:block;margin-bottom:4px;color:#17211d;font-size:19.5px!important;line-height:1.3;font-weight:650!important;letter-spacing:-.01em!important}
[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))!important}
.vx-swing-market-posture h2{margin-bottom:6px;font-size:16.5px!important;line-height:1.15!important}.vx-swing-posture-copy{margin:0;color:#17211d;font-size:12px;line-height:1.45;font-weight:600;letter-spacing:-.01em}
@media(max-width:1000px){.vx-swing-how-list{grid-template-columns:repeat(2,minmax(0,1fr))}[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:720px){.vx-swing-how-block h2{font-size:30px}.vx-swing-how-list{grid-template-columns:1fr}.vx-swing-how-list p{font-size:17px}.vx-swing-how-list strong{font-size:18.5px!important}[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-template-columns:1fr!important}.vx-swing-market-posture h2{font-size:15px!important}.vx-swing-posture-copy{font-size:10.5px}}
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
  return `<section class="vx-swing-how-block" aria-label="How Swing Leaders works" data-vx-swing-how="beginner">
          <h2>How Swing Leaders Works</h2>
          <div class="vx-swing-how-list">
            <p><strong>Active Portfolio</strong>Stocks that are currently in the model portfolio. These are the positions being monitored for the profit target, the scheduled morning stop check, and any Trading Lab removal.</p>
            <p><strong>Candidates</strong>Stocks being watched for a possible future addition. They are not open positions and may never be added.</p>
            <p><strong>Closed Trades</strong>Positions that have left the model portfolio. This section shows the final model return and the recorded reason for exit.</p>
            <p><strong>Position size and exits</strong>Each model position uses a fixed $10,000 allocation. A +10% target may fill during the day. The 5% stop reference is checked during the scheduled morning review, not as an automatic intraday stop. Trading Lab can also remove a position from Active Portfolio.</p>
          </div>
        </section>`;
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

function renameCandidateLabels(html) {
  return String(html).replace(/(<(?:small|strong|h[1-6])\b[^>]*>\s*)Potential Candidates(\s*<\/)/gi, "$1Candidates$2");
}

function refineSwingHtml(html) {
  if (typeof html !== "string" || html.includes(PAGE_MARKER)) return html;
  let out = removeSwingEvidenceContext(html);

  out = out.replace(
    /<small>Model Allocation<\/small><strong>\$10K<\/strong><span>per position<\/span>/i,
    () => '<small>Model Allocation</small><strong>$10K / position</strong>'
  );

  const posture = out.match(/<div\b[^>]*class=["'][^"']*\bsummary-card\b[^"']*\bposture\b[^"']*["'][^>]*>\s*<small>Market Posture<\/small>\s*<strong>([\s\S]*?)<\/strong>\s*<\/div>/i);
  const summary = out.match(/<section\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*aria-label=["']Swing Leaders summary["'][^>]*>[\s\S]*?<\/section>/i);
  const how = out.match(/<section\b[^>]*class=["'][^"']*\bhow\b[^"']*["'][^>]*aria-label=["']How Swing Leaders works["'][^>]*>[\s\S]*?<\/section>/i);

  if (posture && summary && how) {
    const summaryWithoutPosture = summary[0].replace(posture[0], "");
    out = out.replace(summary[0], () => `${renderHowSummaryCard()}\n${summaryWithoutPosture}`);
    out = out.replace(how[0], () => renderMarketPosture(posture[1]));
  }

  out = renameCandidateLabels(out);
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
  renameCandidateLabels,
  refineSwingHtml,
  installSwingUiRefinement,
  wrapExpress,
};
