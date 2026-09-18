"use strict";

const Module = require("module");

const CANONICAL_HOST = "www.vixale.com";
const APEX_HOST = "vixale.com";
const STYLE_ID = "vx-public-qa-style";
const SKIP_ID = "main-content";

const PUBLIC_META = Object.freeze({
  "/": ["Vixale | Trading Systems, Results & Free Viewer Access", "Compare Vixale Day Trading, Swing Trading, and Options, inspect available evidence, and request free read-only viewer access."],
  "/trading-systems": ["Vixale | Trading Systems", "Compare Vixale Day Trading, Swing Trading, and Options by holding horizon, public evidence, and viewer-access boundary."],
  "/trading-systems/day-trading": ["Vixale | Day Trading", "Understand Vixale Day Trading, Prime and Edge, public realized evidence, and what read-only viewer access adds."],
  "/trading-systems/swing-trading": ["Vixale | Swing Trading", "Review the public Vixale Swing research/model portfolio, model equity history, and delayed-quote disclosures."],
  "/trading-systems/options": ["Vixale | Options", "Understand the owner-entered Vixale Option Journal evidence and what protected viewer access adds."],
  "/results": ["Vixale | Results by Trading System", "Review Day Trading, Swing Trading, and Options evidence separately with their source and access boundaries."],
  "/services": ["Vixale | Services", "Choose among Signals & Research, Automation / Setup, Strategy Review / Development, and Custom Bot / Integration services."],
  "/access": ["Vixale | Request Free Viewer Access", "Request free read-only Vixale viewer access, verify your email, and await manual approval."],
  "/about": ["Vixale | About", "Learn about Vixale, an independent trading-systems, research, automation, and software project."],
  "/trading-guide": ["Vixale | Trading Guide", "Read the Vixale operating guide for Day Trading, Swing Trading, Options, access, and risk context."],
  "/pricing": ["Vixale | Day Trading Evidence Preview", "Inspect the Day Trading realized-results preview and request free read-only viewer access."],
  "/closed-trades": ["Vixale | Day Trading Closed Trades", "Review the public Day Trading closed-trades archive and realized evidence context."],
  "/risk-management": ["Vixale | Risk Management", "Review Vixale risk disclosures and general risk-management information for trading-system users."],
});

const SITEMAP_PATHS = Object.freeze(Object.keys(PUBLIC_META).filter(path => path !== "/pricing"));

const styles = `<style id="${STYLE_ID}">
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{overflow-x:hidden}img,svg{max-width:100%}input,select,textarea,button{font:inherit}.vx-skip-link{position:fixed;left:12px;top:10px;z-index:2147483647;transform:translateY(-180%);padding:10px 14px;border-radius:10px;background:#101713;color:#fff!important;font-size:14px;font-weight:700;text-decoration:none}.vx-skip-link:focus{transform:translateY(0)}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid #087a48!important;outline-offset:3px!important}.vx-watch-chart-svg text,.vx-home-equity-svg text{fill:#5f6d67!important}.vx-evidence-freshness-note,.vx-evidence-coverage{font-size:12px!important;color:#5f6d67!important}input:invalid:focus,select:invalid:focus,textarea:invalid:focus{border-color:#9b2c2c!important;box-shadow:0 0 0 3px rgba(155,44,44,.12)!important}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}@media(max-width:768px){main,.wrap{max-width:100%}.table-wrap{max-width:100%;overflow-x:auto}.vx-evidence-facts{grid-template-columns:1fr!important}}@media(max-width:390px){.wrap{padding-left:16px!important;padding-right:16px!important}.vx-public-nav-cta{min-height:42px!important}.vx-systems-btn,.vx-watch-btn,.vx-home-hero-btn{white-space:normal;text-align:center}.vx-evidence-context{padding:16px!important}}@media(min-width:1200px){main{min-width:0}}
</style>`;

function escapeXml(value) {
  return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}

function canonicalUrl(pathname) {
  return `https://${CANONICAL_HOST}${pathname === "/" ? "/" : pathname}`;
}

function canonicalRedirectTarget(host, originalUrl) {
  const cleanHost = String(host || "").split(":")[0].trim().toLowerCase();
  if (cleanHost !== APEX_HOST) return null;
  const suffix = String(originalUrl || "/").startsWith("/") ? String(originalUrl || "/") : `/${String(originalUrl || "")}`;
  return `https://${CANONICAL_HOST}${suffix}`;
}

function removeTag(html, pattern) {
  return String(html).replace(pattern, "");
}

function insertHead(html, markup) {
  return html.includes("</head>") ? html.replace("</head>", `${markup}\n</head>`) : `${markup}${html}`;
}

function setTitle(html, title) {
  const safe = String(title);
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safe}</title>`);
  return insertHead(html, `<title>${safe}</title>`);
}

function setSeo(html, pathname) {
  const meta = PUBLIC_META[pathname];
  if (!meta) return html;
  const [title, description] = meta;
  let out = setTitle(String(html), title);
  out = removeTag(out, /<meta\b[^>]*name=["']description["'][^>]*>\s*/gi);
  out = removeTag(out, /<meta\b[^>]*name=["']robots["'][^>]*>\s*/gi);
  out = removeTag(out, /<meta\b[^>]*property=["']og:(?:title|description|url|type)["'][^>]*>\s*/gi);
  out = removeTag(out, /<meta\b[^>]*name=["']twitter:card["'][^>]*>\s*/gi);
  out = removeTag(out, /<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi);
  const url = canonicalUrl(pathname);
  const tags = [
    `<meta name="description" content="${description}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary">',
  ].join("\n");
  return insertHead(out, tags);
}

function ensureMainTarget(html) {
  let out = String(html);
  if (out.includes(`id="${SKIP_ID}"`) || out.includes(`id='${SKIP_ID}'`)) return out;
  const main = /<main\b([^>]*)>/i.exec(out);
  if (!main) return out;
  const attrs = main[1] || "";
  const replacement = `<main id="${SKIP_ID}" tabindex="-1"${attrs}>`;
  out = out.slice(0, main.index) + replacement + out.slice(main.index + main[0].length);
  const body = /<body\b[^>]*>/i.exec(out);
  if (body && !out.includes('class="vx-skip-link"')) {
    const at = body.index + body[0].length;
    out = out.slice(0, at) + `<a class="vx-skip-link" href="#${SKIP_ID}">Skip to content</a>` + out.slice(at);
  }
  return out;
}

function applyAccessibility(html) {
  let out = ensureMainTarget(String(html));
  out = out.split("fill:'#87918d'").join("fill:'#5f6d67'");
  out = out.split('fill="#87918d"').join('fill="#5f6d67"');
  if (!out.includes(`id="${STYLE_ID}"`)) out = insertHead(out, styles);
  return out;
}

function refinePublicQaHtml(html, pathname) {
  if (typeof html !== "string" || !PUBLIC_META[pathname]) return html;
  return applyAccessibility(setSeo(html, pathname));
}

function renderRobotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /dashboard",
    "Disallow: /dashboard/",
    "Disallow: /dashboard-access/",
    "Disallow: /trading-systems/options/viewer",
    `Sitemap: https://${CANONICAL_HOST}/sitemap.xml`,
    "",
  ].join("\n");
}

function renderSitemapXml() {
  const urls = SITEMAP_PATHS.map(path => `  <url><loc>${escapeXml(canonicalUrl(path))}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function installPublicQaRefinement(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const isRead = method === "GET" || method === "HEAD";
    const pathname = String(req.originalUrl || req.url || "/").split("?")[0];
    if (!isRead) return next();

    const redirect = canonicalRedirectTarget(req.get?.("host") || req.headers?.host || "", req.originalUrl || req.url || "/");
    if (redirect) return res.redirect(308, redirect);

    if (pathname === "/robots.txt") {
      res.status(200); res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=3600");
      return method === "HEAD" ? res.end() : res.send(renderRobotsTxt());
    }
    if (pathname === "/sitemap.xml") {
      res.status(200); res.setHeader("Content-Type", "application/xml; charset=utf-8"); res.setHeader("Cache-Control", "public, max-age=3600");
      return method === "HEAD" ? res.end() : res.send(renderSitemapXml());
    }
    if (!PUBLIC_META[pathname]) return next();

    const send = res.send.bind(res);
    res.send = function sendWithPublicQa(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refinePublicQaHtml(body, pathname);
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length","name","prototype","arguments","caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixalePublicQaWrapped) return factory;
  function wrapped(...args) { const app = factory(...args); installPublicQaRefinement(app); return app; }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixalePublicQaWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixalePublicQaModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = { CANONICAL_HOST, APEX_HOST, STYLE_ID, SKIP_ID, PUBLIC_META, SITEMAP_PATHS, canonicalUrl, canonicalRedirectTarget, setSeo, ensureMainTarget, applyAccessibility, refinePublicQaHtml, renderRobotsTxt, renderSitemapXml, installPublicQaRefinement, wrapExpress };
