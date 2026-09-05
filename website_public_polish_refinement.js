"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const SYSTEM_PATHS = new Set([
  SYSTEMS_PATH,
  `${SYSTEMS_PATH}/day-trading`,
  `${SYSTEMS_PATH}/swing-trading`,
  `${SYSTEMS_PATH}/options`,
]);
const STYLE_ID = "vx-public-polish-style";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDirectTextLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "gi");
  return html.replace(pattern, (_match, rawAttrs) => {
    let attrs = String(rawAttrs || "");
    if (/\bhref\s*=\s*(["'])[^"']*\1/i.test(attrs)) {
      attrs = attrs.replace(/\bhref\s*=\s*(["'])[^"']*\1/i, `href="${href}"`);
    } else {
      attrs += ` href="${href}"`;
    }
    return `<a${attrs}>${newText}</a>`;
  });
}

const styles = `
<style id="${STYLE_ID}">
  .vx-home-split h1{font-size:clamp(27px,2.8vw,36px)!important;line-height:1.08!important;letter-spacing:-.032em!important}
  .vx-home-equity-foot{gap:10px;flex-wrap:wrap}
  .vx-home-equity-pill{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 15px;border:1px solid #d4e0da;border-radius:999px;background:#fff;color:#17211d!important;text-decoration:none!important;font-size:11px;font-weight:650;line-height:1;box-shadow:0 8px 20px rgba(31,67,51,.055);transition:transform .16s ease,box-shadow .16s ease}
  .vx-home-equity-pill:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(31,67,51,.08)}
  .vx-systems-hero h1{font-size:clamp(20px,2.5vw,31px)!important;line-height:1.15!important;letter-spacing:-.025em!important}
  @media(max-width:700px){.vx-systems-hero h1{font-size:clamp(19px,5vw,24px)!important}.vx-home-equity-foot{align-items:stretch}.vx-home-equity-pill{width:100%;box-sizing:border-box}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function polishHome(html) {
  let result = html;
  result = replaceDirectTextLink(result, "Book Setup Call", "/services", "Our Services");
  result = result.replace(
    /<span\s+id=["']vx-home-equity-status["']>([\s\S]*?)<\/span>/i,
    '<a id="vx-home-equity-status" class="vx-home-equity-pill" href="/closed-trades">$1</a>'
  );
  result = result.replace(
    /<a\s+href=["']\/pricing["']>\s*View performance details\s*<\/a>/i,
    '<a class="vx-home-equity-pill" href="/pricing">View performance details</a>'
  );
  return injectStyles(result);
}

function polishSystems(html) {
  return injectStyles(html);
}

function refinePublicPolish(html, path) {
  if (typeof html !== "string") return html;
  if (path === HOME_PATH) return polishHome(html);
  if (SYSTEM_PATHS.has(path)) return polishSystems(html);
  return html;
}

function installPublicPolishRefinement(app) {
  app.use((req, res, next) => {
    const path = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || (path !== HOME_PATH && !SYSTEM_PATHS.has(path))) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithPublicPolish(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refinePublicPolish(body, path);
      }
      return originalSend(body);
    };
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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePublicPolishWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPublicPolishRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePublicPolishWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePublicPolishModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SYSTEMS_PATH,
  SYSTEM_PATHS,
  STYLE_ID,
  replaceDirectTextLink,
  injectStyles,
  polishHome,
  polishSystems,
  refinePublicPolish,
  installPublicPolishRefinement,
  wrapExpress,
};
