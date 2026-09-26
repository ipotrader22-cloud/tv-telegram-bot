"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const STYLE_ID = "vx-swing-active-portfolio-rules-style";
const RULES_CLASS = "vx-swing-portfolio-rules";

function normalizeHost(value) {
  return String(value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0];
}

function requestLocale(req) {
  const host = normalizeHost(req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "");
  return host === "ru.vixale.com" ? "ru" : "en";
}

function renderRules(locale = "en") {
  const ru = locale === "ru";
  const copy = ru ? {
    target: "Цель +10%",
    targetBody: "Может сработать внутри дня, как только цена достигнет +10% от цены входа.",
    stop: "Стоп -5%",
    stopBody: "Оценивается только по дневному закрытию; срабатывает, если цена закрытия более чем на 5% ниже цены входа.",
    label: "Правила цели прибыли и стопа",
  } : {
    target: "Target +10%",
    targetBody: "May trigger intraday as soon as price reaches +10% from entry.",
    stop: "Stop -5%",
    stopBody: "Evaluated on the daily close only; triggered when the closing price is more than 5% below entry.",
    label: "Profit target and stop rules",
  };

  return `<div class="${RULES_CLASS}" aria-label="${copy.label}">
    <div class="vx-swing-rule-row"><strong class="target">${copy.target}</strong><span>${copy.targetBody}</span></div>
    <div class="vx-swing-rule-row"><strong class="stop">${copy.stop}</strong><span>${copy.stopBody}</span></div>
  </div>`;
}

const styles = `<style id="${STYLE_ID}">
.vx-active-portfolio-head{display:grid!important;grid-template-columns:minmax(260px,1fr) minmax(320px,.92fr) auto;grid-template-areas:"intro rules metric";align-items:center!important;gap:18px!important}.vx-active-portfolio-intro{grid-area:intro}.vx-active-portfolio-head .section-metric{grid-area:metric}.vx-swing-portfolio-rules{grid-area:rules;display:grid;gap:7px;min-width:0;padding:2px 18px;border-left:1px solid #dfe8e3;border-right:1px solid #dfe8e3;color:#52605a;font-size:11px;line-height:1.38}.vx-swing-rule-row{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;align-items:start}.vx-swing-rule-row strong{font-size:11px;line-height:1.38;font-weight:750;white-space:nowrap}.vx-swing-rule-row strong.target{color:#087a48}.vx-swing-rule-row strong.stop{color:#9b3943}.vx-swing-rule-row span{min-width:0}
@media(max-width:920px){.vx-active-portfolio-head{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"intro metric" "rules rules";align-items:start!important}.vx-swing-portfolio-rules{margin-top:2px;padding:12px 0 0;border-left:0;border-right:0;border-top:1px solid #dfe8e3}}
@media(max-width:720px){.vx-active-portfolio-head{grid-template-columns:1fr;grid-template-areas:"intro" "rules" "metric"}.vx-active-portfolio-head .section-metric{text-align:left}.vx-swing-portfolio-rules{width:100%}.vx-swing-rule-row{grid-template-columns:82px minmax(0,1fr)}}
</style>`;

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", () => `${styles}\n</head>`) : `${styles}${html}`;
}

function refineSwingActivePortfolioRules(html, locale = "en") {
  if (typeof html !== "string" || html.includes(`class="${RULES_CLASS}"`)) return html;

  let inserted = false;
  let out = html.replace(
    /<div class="section-head"><div>(<h2\b[^>]*>\s*Active Portfolio\s*<\/h2>\s*<p>[\s\S]*?<\/p>)<\/div>\s*<div class="section-metric">/i,
    (_match, intro) => {
      inserted = true;
      return `<div class="section-head vx-active-portfolio-head"><div class="vx-active-portfolio-intro">${intro}</div>${renderRules(locale)}<div class="section-metric">`;
    }
  );

  return inserted ? injectStyles(out) : html;
}

function installSwingActivePortfolioRules(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || requestPath(req) !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingActivePortfolioRules(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 400) {
        body = refineSwingActivePortfolioRules(body, requestLocale(req));
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
  if (typeof factory !== "function" || factory.__vixaleSwingActivePortfolioRulesWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingActivePortfolioRules(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingActivePortfolioRulesWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingActivePortfolioRulesModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  STYLE_ID,
  RULES_CLASS,
  normalizeHost,
  requestPath,
  requestLocale,
  renderRules,
  injectStyles,
  refineSwingActivePortfolioRules,
  installSwingActivePortfolioRules,
  wrapExpress,
};
