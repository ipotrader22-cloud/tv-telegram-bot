"use strict";

const Module = require("module");

const STYLE_ID = "vx-description-card-standard-style";

const styles = `<style id="${STYLE_ID}">
:root{--vx-canonical-section-heading-size:24px}
.vx-description-card,
.vx-conversion-hero-copy>p,
.vx-conversion-system-hero>div>p,
.vx-results-intro>p,
[data-vx-conversion-system-page="swing"] .hero .hero-copy,
.vx-swing-how-list>p,
.vx-conversion-system-cards>article,
.vx-conversion-proof-row>article,
.vx-results-options-boundary,
.vx-results-boundary,
.vx-evidence-context,
.disclosure{box-sizing:border-box;border:1px solid #d7e8df!important;border-radius:24px!important;background:linear-gradient(135deg,#eaf8f0 0%,#f6fbf8 52%,#fff 100%)!important;box-shadow:0 12px 30px rgba(23,100,66,.07)!important}
.vx-conversion-hero-copy>p,
.vx-conversion-system-hero>div>p,
.vx-results-intro>p,
[data-vx-conversion-system-page="swing"] .hero .hero-copy{padding:16px 20px!important}
@media(max-width:720px){
.vx-description-card,
.vx-conversion-hero-copy>p,
.vx-conversion-system-hero>div>p,
.vx-results-intro>p,
[data-vx-conversion-system-page="swing"] .hero .hero-copy,
.vx-swing-how-list>p,
.vx-conversion-system-cards>article,
.vx-conversion-proof-row>article,
.vx-results-options-boundary,
.vx-results-boundary,
.vx-evidence-context,
.disclosure{border-radius:21px!important}
.vx-conversion-hero-copy>p,
.vx-conversion-system-hero>div>p,
.vx-results-intro>p,
[data-vx-conversion-system-page="swing"] .hero .hero-copy{padding:15px 17px!important}
}
</style>`;

function injectDescriptionCardStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>")
    ? html.replace("</head>", () => `${styles}\n</head>`)
    : `${styles}${html}`;
}

function installDescriptionCardStandard(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return next();
    const send = res.send.bind(res);
    res.send = function sendDescriptionCardStandard(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 400) {
        body = injectDescriptionCardStyles(body);
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
  if (typeof factory !== "function" || factory.__vixaleDescriptionCardsWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installDescriptionCardStandard(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleDescriptionCardsWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleDescriptionCardsModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  STYLE_ID,
  styles,
  injectDescriptionCardStyles,
  installDescriptionCardStandard,
  wrapExpress,
};
