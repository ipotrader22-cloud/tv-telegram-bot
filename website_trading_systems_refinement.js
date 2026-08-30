"use strict";

const Module = require("module");

const GUIDE_PATH = "/trading-guide";
const SWING_PATH = "/swing-leaders";
const SYSTEMS_PATH = "/trading-systems";
const NAV_MARKER = "vx-beginner-nav-link";
const STYLE_MARKER = "vx-trading-systems-refinement-styles";

const refinementStyles = `
<style id="${STYLE_MARKER}">
  .nav-links .${NAV_MARKER}{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 13px;border:1px solid #bfead5;border-radius:999px;background:#f4fbf7;color:#176442!important;text-decoration:none;font-size:12px;font-weight:650;white-space:nowrap}
  .nav-links .${NAV_MARKER}:hover{border-color:#8fd5b3;background:#edf8f1}
  .vx-swing-simple-head{max-width:760px}
  .vx-swing-system-card{display:grid;grid-template-columns:1.05fr .95fr;gap:22px;padding:28px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(238,244,255,.72));box-shadow:var(--shadow-soft)}
  .vx-swing-system-main h3{margin:8px 0 12px;font-size:30px;letter-spacing:-.025em}
  .vx-swing-system-main p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.65}
  .vx-swing-system-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
  .vx-swing-system-action{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 15px;border:1px solid #bfead5;border-radius:999px;background:#fff;color:var(--green-dark);text-decoration:none;font-size:12.5px;font-weight:650}
  .vx-swing-system-action.primary{background:var(--green-dark);border-color:var(--green-dark);color:#fff}
  .vx-swing-system-action:hover{transform:translateY(-1px)}
  .vx-swing-system-rules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .vx-swing-system-rule{min-height:116px;padding:16px;border:1px solid var(--blue-line);border-radius:18px;background:rgba(255,255,255,.78)}
  .vx-swing-system-rule strong{display:block;margin-bottom:7px;color:var(--ink);font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}
  .vx-swing-system-rule span{display:block;color:var(--muted);font-size:13.5px;line-height:1.5}
  @media(max-width:980px){.nav-links .${NAV_MARKER}{display:inline-flex!important}.vx-swing-system-card{grid-template-columns:1fr}.vx-swing-system-rules{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:620px){.nav-links .${NAV_MARKER}{min-height:32px;padding:0 10px;font-size:11px}.vx-swing-system-card{padding:20px;border-radius:22px}.vx-swing-system-rules{grid-template-columns:1fr}.vx-swing-system-actions{flex-direction:column}.vx-swing-system-action{width:100%}}
</style>`;

function renderSwingSystemSection() {
  return `<section class="wrap section horizon-section" id="swing-trading">
      <div class="section-head vx-swing-simple-head">
        <div class="market-kicker"><span class="market-label">Swing Trading</span><span class="status-pill swing">Vixale Swing System</span></div>
        <h2>Vixale Swing System</h2>
        <p class="lead">A systematic multi-session portfolio reviewed each trading morning during the 9:45–10:00 AM ET update window.</p>
      </div>

      <div class="vx-swing-system-card">
        <div class="vx-swing-system-main">
          <span class="horizon-kicker">Current Swing System</span>
          <h3>Vixale Swing System</h3>
          <p>New positions may be added when the scanner identifies symbols that meet the system's selection criteria. If an existing holding no longer meets those conditions, it may be removed from Active Portfolio and should be closed according to the published portfolio update.</p>
          <div class="vx-swing-system-actions">
            <a class="vx-swing-system-action primary" href="${SWING_PATH}">View Swing Leaders →</a>
            <a class="vx-swing-system-action" href="${GUIDE_PATH}#swing-trading">Read rules in Beginner Guide →</a>
          </div>
        </div>
        <div class="vx-swing-system-rules" aria-label="Vixale Swing System rules">
          <div class="vx-swing-system-rule"><strong>Profit target</strong><span>+10% from the actual entry price.</span></div>
          <div class="vx-swing-system-rule"><strong>Defined risk</strong><span>5% stop level, evaluated on the daily close.</span></div>
          <div class="vx-swing-system-rule"><strong>Portfolio review</strong><span>Check for updates each trading morning from 9:45–10:00 AM ET.</span></div>
          <div class="vx-swing-system-rule"><strong>Additions &amp; removals</strong><span>Qualifying symbols can be added. Holdings that no longer meet the selection criteria can be removed and closed.</span></div>
        </div>
      </div>
    </section>`;
}

function injectBeginnerGuideNav(html) {
  if (html.includes(`class="${NAV_MARKER}"`)) return html;
  const navAnchor = '<div class="nav-links">';
  if (!html.includes(navAnchor)) return html;
  return html.replace(navAnchor, `${navAnchor}<a class="${NAV_MARKER}" href="${GUIDE_PATH}">Beginner Guide</a>`);
}

function injectRefinementStyles(html) {
  if (html.includes(`id="${STYLE_MARKER}"`)) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${refinementStyles}</head>`);
  return `${refinementStyles}${html}`;
}

function replaceSwingSection(html) {
  const pattern = /<section class="wrap section horizon-section" id="swing-trading">[\s\S]*?(?=<section class="wrap section horizon-section" id="market-coverage">)/;
  if (!pattern.test(html)) return html;
  return html.replace(pattern, `${renderSwingSystemSection()}\n\n    `);
}

function refineTradingSystemsHtml(html) {
  if (typeof html !== "string") return html;
  let result = html;
  result = injectRefinementStyles(result);
  result = injectBeginnerGuideNav(result);
  result = replaceSwingSection(result);
  return result;
}

function installTradingSystemsRefinement(app) {
  app.use((req, res, next) => {
    const requestPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (isRead && requestPath === SYSTEMS_PATH) {
      const originalSend = res.send.bind(res);
      res.send = function sendWithTradingSystemsRefinement(body) {
        const contentType = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!contentType || contentType.includes("html"))) body = refineTradingSystemsHtml(body);
        return originalSend(body);
      };
    }
    next();
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleTradingSystemsRefinementWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installTradingSystemsRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleTradingSystemsRefinementWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleTradingSystemsRefinementModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  GUIDE_PATH,
  SWING_PATH,
  SYSTEMS_PATH,
  injectBeginnerGuideNav,
  replaceSwingSection,
  renderSwingSystemSection,
  refineTradingSystemsHtml,
  installTradingSystemsRefinement,
  wrapExpress,
};
