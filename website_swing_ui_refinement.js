"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const STYLE_ID = "vx-swing-ui-refinement-style";
const PAGE_MARKER = 'data-vx-swing-ui-refinement="1"';

const styles = `<style id="${STYLE_ID}">
[data-vx-conversion-system-page="swing"] .hero h1{font-size:clamp(30px,3.5vw,42px)!important;font-weight:550!important;line-height:1.06!important;letter-spacing:-.035em!important}
[data-vx-conversion-system-page="swing"] .hero .hero-copy{box-sizing:border-box;padding:16px 20px;border:1px solid #d7e8df;border-radius:24px;background:linear-gradient(135deg,#eaf8f0 0%,#f6fbf8 52%,#fff 100%);box-shadow:0 12px 30px rgba(23,100,66,.07)}
.vx-swing-how-block{grid-column:1/-1;width:100%;box-sizing:border-box}.vx-swing-how-block h2{margin:0 0 18px;font-size:33px;line-height:1.08;letter-spacing:-.03em;font-weight:600}.vx-swing-how-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;align-items:stretch}.vx-swing-how-list p{box-sizing:border-box;height:100%;margin:0;padding:18px 20px;border:1px solid #d7e8df;border-radius:24px;background:linear-gradient(145deg,#eaf8f0 0%,#f6fbf8 55%,#fff 100%);box-shadow:0 12px 28px rgba(23,100,66,.07);color:#5f6d67;font-size:18px;line-height:1.5}.vx-swing-how-list strong{display:block;margin-bottom:4px;color:#17211d;font-size:19.5px!important;line-height:1.3;font-weight:650!important;letter-spacing:-.01em!important}.vx-swing-copy-row{display:block}.vx-swing-copy-row+.vx-swing-copy-row{margin-top:10px}.vx-swing-how-list .vx-swing-copy-row strong{display:inline;margin:0;color:inherit;font-size:inherit!important;line-height:inherit;font-weight:700!important;letter-spacing:inherit!important}
[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))!important}
.vx-swing-market-update h2{margin-bottom:10px;font-size:16.5px!important;line-height:1.15!important}.vx-swing-posture-copy{margin:0;color:#5f6d67;font-size:18px;line-height:1.5;font-weight:400;letter-spacing:normal}.vx-swing-update-release{margin:10px 0 0;color:#68736f;font-size:12px;line-height:1.4;font-weight:500;letter-spacing:.01em}.vx-swing-update-release strong{color:#17211d;font-weight:600}
@media(max-width:1000px){.vx-swing-how-list{grid-template-columns:repeat(2,minmax(0,1fr))}[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:720px){[data-vx-conversion-system-page="swing"] .hero .hero-copy{padding:15px 17px;border-radius:21px}.vx-swing-how-block h2{font-size:30px}.vx-swing-how-list{grid-template-columns:1fr}.vx-swing-how-list p{padding:16px 17px;border-radius:21px;font-size:17px}.vx-swing-how-list strong{font-size:18.5px!important}[data-vx-conversion-system-page="swing"] .hero-layout .summary{grid-template-columns:1fr!important}.vx-swing-market-update h2{font-size:15px!important}.vx-swing-posture-copy{font-size:17px}.vx-swing-update-release{font-size:11.5px}}
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
            <p><strong>Active Portfolio</strong>Stocks that are currently in the Active portfolio. Positions are monitored for Profit target/Stop Loss/or Removal due to ratings change. Check every morning around 10:06 for updates.</p>
            <p><strong>Candidates</strong>Stocks being watched for a possible future addition. They are not open positions and may never be added.</p>
            <p><strong>Closed Trades</strong>Closed positions due to Profit Target/Stop/Removal from the Active Portfolio.</p>
            <p><strong>Position size and exits</strong><span class="vx-swing-copy-row">Each position uses a fixed $10,000 allocation.</span><span class="vx-swing-copy-row"><strong>Profit Target:</strong> A +10% target may fill during the day.</span><span class="vx-swing-copy-row"><strong>Stop:</strong> The 5% stop reference triggers only on daily close and checked during the scheduled morning review.</span><span class="vx-swing-copy-row">Position can also be removed from Active Portfolio if ranking goes below 70.</span></p>
          </div>
        </section>`;
}

function extractSnapshotRelease(html) {
  const text = String(html || "");
  const stamp = text.match(/<span\b[^>]*class=["'][^"']*\bpill\b[^"']*["'][^>]*>\s*Snapshot\s+(\d{4}-\d{2}-\d{2})\s*·\s*(\d{1,2}(?::\d{2})?\s+ET)\s*<\/span>/i);
  if (stamp) return { date: stamp[1], time: stamp[2] };

  const footer = text.match(/Last Updated\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}(?::\d{2})?\s+ET)/i);
  return footer ? { date: footer[1], time: footer[2] } : null;
}

function renderMarketUpdate(postureHtml, release) {
  const releaseDate = release?.date || "Release date unavailable";
  const releaseTime = release?.time || "Release time unavailable";
  return `<section class="how vx-swing-market-update" aria-label="Market Update" data-vx-swing-market-update="1">
      <h2>Market Update</h2>
      <p class="vx-swing-posture-copy">${postureHtml}</p>
      <p class="vx-swing-update-release"><strong>Released:</strong> ${releaseDate} · ${releaseTime}</p>
    </section>`;
}

function renderMarketPosture(postureHtml, release) {
  return renderMarketUpdate(postureHtml, release);
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
  const release = extractSnapshotRelease(out);

  if (posture && summary && how) {
    const summaryWithoutPosture = summary[0].replace(posture[0], "");
    out = out.replace(summary[0], () => `${renderHowSummaryCard()}\n${summaryWithoutPosture}`);
    out = out.replace(how[0], () => renderMarketUpdate(posture[1], release));
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
  extractSnapshotRelease,
  renderMarketUpdate,
  renderMarketPosture,
  removeSwingEvidenceContext,
  renameCandidateLabels,
  refineSwingHtml,
  installSwingUiRefinement,
  wrapExpress,
};
