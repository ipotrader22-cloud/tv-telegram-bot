"use strict";

const Module = require("module");

const HOME_PATH = "/";
const PRICING_PATH = "/pricing";
const SYSTEMS_PATH = "/trading-systems";
const SYSTEM_PATHS = new Set([
  SYSTEMS_PATH,
  `${SYSTEMS_PATH}/day-trading`,
  `${SYSTEMS_PATH}/swing-trading`,
  `${SYSTEMS_PATH}/options`,
]);
const STYLE_ID = "vx-public-polish-style";
const SCRIPT_ID = "vx-public-polish-script";

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
  .vx-home-equity-pill,#vx-home-equity-status{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 15px;border:1px solid #d4e0da;border-radius:999px;background:#fff;color:#17211d!important;text-decoration:none!important;font-size:11px;font-weight:650;line-height:1;box-shadow:0 8px 20px rgba(31,67,51,.055);transition:transform .16s ease,box-shadow .16s ease;box-sizing:border-box}
  .vx-home-equity-pill:hover,#vx-home-equity-status:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(31,67,51,.08)}
  .vx-systems-hero h1{font-size:clamp(20px,2.5vw,31px)!important;line-height:1.15!important;letter-spacing:-.025em!important}
  .vx-guide-compact .vx-guide-grid .vx-guide-title{font-size:13px!important;line-height:1.18!important;letter-spacing:-.012em!important;white-space:nowrap!important}
  .vx-guide-compact .vx-guide-btn.primary{background:#078f51!important;border-color:#078f51!important;color:#fff!important;box-shadow:0 10px 24px rgba(7,143,81,.14)!important}
  .vx-category-grid{gap:14px!important;margin-top:34px!important}
  .vx-category-card{min-height:0!important;padding:18px 22px!important}
  .vx-category-card h2{margin-top:7px!important}
  .vx-category-card p{margin-top:4px!important}
  .vx-category-card span:last-child{margin-top:12px!important;padding-top:0!important}
  .vx-watch-hero{max-width:680px!important}
  .vx-watch-hero h1,.vx-watch-lead{max-width:640px!important}
  .vx-watch-hero h1{margin-top:14px!important;font-size:clamp(24px,2.7vw,30px)!important;line-height:1.12!important;letter-spacing:-.025em!important}
  .vx-watch-lead{margin-top:13px!important;font-size:16px!important;line-height:1.5!important}
  @media(max-width:960px){.vx-guide-compact .vx-guide-grid .vx-guide-title{font-size:18px!important;white-space:normal!important}}
  @media(max-width:900px){.vx-category-card{min-height:0!important}}
  @media(max-width:700px){.vx-systems-hero h1{font-size:clamp(19px,5vw,24px)!important}.vx-home-equity-foot{align-items:stretch}.vx-home-equity-pill,#vx-home-equity-status{width:100%;box-sizing:border-box}.vx-watch-hero h1{font-size:clamp(24px,7vw,28px)!important}.vx-watch-lead{font-size:15px!important}.vx-category-grid{margin-top:28px!important}.vx-category-card{padding:17px 18px!important}}
</style>`;

const homeScript = `
<script id="${SCRIPT_ID}">
(() => {
  const promoteLedger = () => {
    const el = document.getElementById('vx-home-equity-status');
    if (!el) return;
    if (el.tagName === 'A') {
      el.setAttribute('href', '/closed-trades');
      el.classList.add('vx-home-equity-pill');
      return;
    }
    const link = document.createElement('a');
    link.id = 'vx-home-equity-status';
    link.className = 'vx-home-equity-pill';
    link.href = '/closed-trades';
    link.textContent = el.textContent || 'Verified · Closed Trades ledger';
    el.replaceWith(link);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', promoteLedger, { once: true });
  else promoteLedger();
})();
</script>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function injectHomeScript(html) {
  if (html.includes(`id="${SCRIPT_ID}"`)) return html;
  return html.includes("</body>") ? html.replace("</body>", `${homeScript}\n</body>`) : `${html}${homeScript}`;
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
  result = injectStyles(result);
  return injectHomeScript(result);
}

function polishSystems(html) {
  return injectStyles(html);
}

function polishPricing(html) {
  return injectStyles(html);
}

function refinePublicPolish(html, path) {
  if (typeof html !== "string") return html;
  if (path === HOME_PATH) return polishHome(html);
  if (SYSTEM_PATHS.has(path)) return polishSystems(html);
  if (path === PRICING_PATH) return polishPricing(html);
  return html;
}

function installPublicPolishRefinement(app) {
  app.use((req, res, next) => {
    const path = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    const isSupported = path === HOME_PATH || path === PRICING_PATH || SYSTEM_PATHS.has(path);
    if (!isRead || !isSupported) return next();

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
  PRICING_PATH,
  SYSTEMS_PATH,
  SYSTEM_PATHS,
  STYLE_ID,
  SCRIPT_ID,
  replaceDirectTextLink,
  injectStyles,
  injectHomeScript,
  polishHome,
  polishSystems,
  polishPricing,
  refinePublicPolish,
  installPublicPolishRefinement,
  wrapExpress,
};
