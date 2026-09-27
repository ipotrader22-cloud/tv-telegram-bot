"use strict";

const Module = require("module");

const STYLE_ID = "vx-public-navigation-alignment-style";
const NAV_MARKER = 'class="vx-unified-public-nav"';

const styles = `<style id="${STYLE_ID}">
@media(min-width:1001px){
  nav:has(.vx-unified-public-nav),
  header .wrap:has(.vx-unified-public-nav),
  .topbar .wrap:has(.vx-unified-public-nav){display:flex!important;align-items:center!important;flex-wrap:nowrap!important}
  nav:has(.vx-unified-public-nav)>.brand,
  header .wrap:has(.vx-unified-public-nav)>.brand,
  .topbar .wrap:has(.vx-unified-public-nav)>.brand{flex:0 0 auto!important}
  .nav-links,.navlinks{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;column-gap:14px!important;flex:1 1 auto!important;min-width:0!important;flex-wrap:nowrap!important}
  .vx-unified-public-nav{display:flex!important;align-items:center!important;flex-wrap:nowrap!important;min-width:0!important;width:auto!important;gap:clamp(10px,1.2vw,18px)!important;padding-top:0!important}
  .vx-direct-nav-actions{display:flex!important;align-items:center!important;align-self:center!important;gap:10px!important;margin-left:0!important;white-space:nowrap!important}
  .vx-public-nav-login,.vx-public-nav-cta{align-self:center!important}
}
@media(min-width:1001px) and (max-width:1180px){
  .vx-unified-public-nav{gap:9px!important}
  .vx-unified-public-nav a{font-size:12.5px!important}
  .vx-direct-nav-actions{gap:8px!important}
  .vx-public-nav-login{font-size:13px!important}
  .vx-public-nav-cta{min-height:44px!important;padding:0 16px!important;font-size:12.5px!important}
}
</style>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0];
}

function injectAlignmentStyles(html) {
  if (typeof html !== "string" || !html.includes(NAV_MARKER) || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function installPublicNavigationAlignment(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return next();

    const send = res.send.bind(res);
    res.send = function sendWithPublicNavigationAlignment(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = injectAlignmentStyles(body);
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
  if (typeof factory !== "function" || factory.__vixalePublicNavigationAlignmentWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installPublicNavigationAlignment(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixalePublicNavigationAlignmentWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixalePublicNavigationAlignmentModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  STYLE_ID,
  NAV_MARKER,
  styles,
  requestPath,
  injectAlignmentStyles,
  installPublicNavigationAlignment,
  wrapExpress,
};
