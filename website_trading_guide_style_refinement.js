"use strict";

const Module = require("module");

const GUIDE_PATH = "/trading-guide";
const STYLE_ID = "vx-trading-guide-site-style";

const siteAlignedStyles = `
<style id="${STYLE_ID}">
  body{background:#f8fbf9}
  .topbar{background:rgba(248,251,249,.94);border-bottom-color:#dce8e1}
  .wrap{width:min(1180px,calc(100% - 48px))}
  .brand{font-weight:750;letter-spacing:.15em}
  .navlinks>a:not(.vx-guide-btn){color:#66736d}
  .vx-guide-btn{font-weight:600;box-shadow:none}

  .hero{padding:54px 0 42px;background:linear-gradient(180deg,#f2fbf6 0%,#f8fbf9 100%)}
  .hero-grid{grid-template-columns:1.08fr .92fr;gap:36px;align-items:center}
  .kicker{color:#557d6b;font-size:11px;font-weight:650;letter-spacing:.08em}
  .hero h1{margin:10px 0 16px;font-size:clamp(38px,4.4vw,56px);line-height:1.05;letter-spacing:-.035em;font-weight:500}
  .hero p{max-width:690px;color:#68766f;font-size:16px;line-height:1.72}
  .hero-card{padding:22px;border-color:#dbe7e0;border-radius:24px;background:rgba(255,255,255,.82);box-shadow:0 10px 28px rgba(24,54,42,.05)}
  .toc{gap:8px}
  .toc a{padding:12px 14px;border-color:#dce7e1;border-radius:15px;background:rgba(255,255,255,.72);color:#56645d}
  .toc b{font-weight:600;color:#24352e}
  .flow{margin-top:26px;padding:14px;border-color:#dce7e1;border-radius:22px;background:rgba(255,255,255,.72)}
  .flow b{min-height:50px;border-radius:14px;background:#f3f8f5;font-weight:600;color:#24352e}

  .section{padding:38px 0 58px}
  .section-head{margin-bottom:20px;align-items:end}
  .section-head h2{margin-top:6px;font-size:clamp(28px,3vw,34px);line-height:1.15;letter-spacing:-.025em;font-weight:500}
  .section-head p{color:#6a7771;font-size:14.5px;line-height:1.65}
  .guide-grid{gap:16px}
  .guide-card,.example{border-color:#dce7e1;border-radius:24px;box-shadow:0 7px 22px rgba(24,54,42,.035)}
  .guide-card{padding:24px}
  .guide-step{grid-template-columns:32px 1fr;gap:12px}
  .guide-step>span{width:30px;height:30px;background:#edf7f2;color:#2f7154;font-weight:700}
  .guide-step strong{font-size:14px;font-weight:600;color:#26352f}
  .guide-step p{color:#6a7771;font-size:13.5px;line-height:1.58}
  .example{padding:22px;background:rgba(255,255,255,.78)}
  .example h3{margin-bottom:14px;font-size:19px;line-height:1.2;letter-spacing:-.01em;font-weight:600}
  .quote{border-radius:16px;background:#14231d;font-size:12.5px;line-height:1.6}
  .row{color:#33433c}
  .row span{color:#728079}
  .row b{font-weight:600}
  .note{background:#fbf7ed;color:#746443}

  .quick{margin-bottom:72px;padding:26px;border-radius:26px;background:#17362b;box-shadow:none}
  .quick h2{font-size:26px;line-height:1.2;letter-spacing:-.02em;font-weight:500}
  .quick-item strong{font-weight:600}
  .footer{color:#7a8781}

  @media(max-width:820px){
    .hero{padding:42px 0 34px}
    .hero-grid{gap:22px}
    .section{padding:32px 0 48px}
    .section-head{gap:12px}
  }
  @media(max-width:560px){
    .wrap{width:min(100% - 28px,1180px)}
    .hero{padding-top:34px}
    .hero h1{font-size:36px;letter-spacing:-.03em}
    .hero p{font-size:15px}
    .hero-card,.guide-card,.example{border-radius:20px}
    .guide-card,.example{padding:19px}
    .section-head h2{font-size:27px}
    .quick{padding:22px;border-radius:22px}
  }
</style>`;

function refineTradingGuideStyle(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  if (html.includes("</head>")) return html.replace("</head>", `${siteAlignedStyles}</head>`);
  return `${siteAlignedStyles}${html}`;
}

function installTradingGuideStyleMiddleware(app) {
  app.use((req, res, next) => {
    const requestPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (isRead && requestPath === GUIDE_PATH) {
      const originalSend = res.send.bind(res);
      res.send = function sendWithSiteAlignedGuideStyle(body) {
        const contentType = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
          body = refineTradingGuideStyle(body);
        }
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleTradingGuideStyleWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installTradingGuideStyleMiddleware(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleTradingGuideStyleWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleTradingGuideStyleModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  GUIDE_PATH,
  STYLE_ID,
  siteAlignedStyles,
  refineTradingGuideStyle,
  installTradingGuideStyleMiddleware,
  wrapExpress,
};
