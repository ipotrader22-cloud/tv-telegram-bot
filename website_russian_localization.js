"use strict";

const Module = require("module");

const RU_HOST = "ru.vixale.com";
const EN_HOST = "www.vixale.com";
const LOCALE = "ru";
const HOME_PATH = "/";
const RUNTIME_SCRIPT_ID = "vx-ru-runtime-localizer";
const PRIVATE_PREFIXES = Object.freeze([
  "/admin",
  "/tv",
  "/ib/",
  "/api/",
  "/webhook",
]);

// The Russian site deliberately reuses the final English HTML so structure, CSS,
// responsive behavior, live-data wiring, forms and authorization remain identical.
// Only user-facing copy and locale metadata are transformed here.
const TRANSLATIONS = Object.freeze([
  ...require("./website_russian_translations_1"),
  ...require("./website_russian_translations_2"),
  ...require("./website_russian_translations_3"),
  ...require("./website_russian_translations_4"),
  ...require("./website_russian_translations_5"),
  ...require("./website_russian_translations_6"),
  ...require("./website_russian_translations_7"),
  ...require("./website_russian_translations_8"),
  ...require("./website_russian_translations_9"),
  ...require("./website_russian_translations_10"),
  ...require("./website_russian_translations_regression"),
  ...require("./website_russian_translations_current_public_pages"),
]);

const ATTRIBUTE_NAMES = new Set(["placeholder", "aria-label", "title", "alt"]);
const TRANSLATION_MAP = new Map(TRANSLATIONS);
const RUNTIME_TRANSLATION_PATTERNS = Object.freeze([
  Object.freeze({
    source: "^Research/model portfolio · latest published update (.+) · last validated snapshot$",
    replacement: "Исследовательский/модельный портфель · последнее опубликованное обновление $1 · последний подтверждённый снимок",
  }),
  Object.freeze({
    source: "^Research/model portfolio · latest published update (.+)$",
    replacement: "Исследовательский/модельный портфель · последнее опубликованное обновление $1",
  }),
  Object.freeze({
    source: "^Day Trading realized P&L history; latest (.+)$",
    replacement: "История реализованного P&L дейтрейдинга; последнее значение: $1",
  }),
  Object.freeze({
    source: "^Swing Trading model P&L equity history; latest (.+)$",
    replacement: "История капитала модельного P&L свинг-трейдинга; последнее значение: $1",
  }),
  Object.freeze({ source: "^Last updated: (.+)$", replacement: "Последнее обновление: $1" }),
  Object.freeze({ source: "^Score (.+)$", replacement: "Рейтинг $1" }),
]);

function normalizeHost(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function requestHost(req) {
  return req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "";
}

function isRussianHost(value) {
  return normalizeHost(value) === RU_HOST;
}

function pathnameOf(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function isLocalizablePath(pathname) {
  const path = String(pathname || "/");
  return !PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix));
}

function preserveCase(source, translated) {
  if (!source || !translated) return translated;
  if (source.toUpperCase() === source && /[A-Z]/.test(source)) return translated.toUpperCase();
  return translated;
}

function splitOuterWhitespace(value) {
  const source = String(value ?? "");
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  const end = Math.max(leading.length, source.length - trailing.length);
  return {
    source,
    leading,
    core: source.slice(leading.length, end),
    trailing,
  };
}

function translateChunk(value) {
  const { source, leading, core, trailing } = splitOuterWhitespace(value);
  if (!/[A-Za-z]/.test(core)) return source;

  // Translation is intentionally exact-node only. Substring replacement can
  // produce mixed-language copy (for example translating only “research/model
  // portfolio” or “Review” inside a longer English sentence). A text node must
  // have an explicit translation or remain untouched for QA rather than become
  // a Russian/English hybrid.
  const translated = TRANSLATION_MAP.get(core);
  if (translated === undefined) return source;
  return `${leading}${preserveCase(core, translated)}${trailing}`;
}

function translateRuntimeChunk(value) {
  const { source, leading, core, trailing } = splitOuterWhitespace(value);
  if (!/[A-Za-z]/.test(core)) return source;

  const exact = TRANSLATION_MAP.get(core);
  if (exact !== undefined) return `${leading}${preserveCase(core, exact)}${trailing}`;

  for (const pattern of RUNTIME_TRANSLATION_PATTERNS) {
    const regex = new RegExp(pattern.source);
    if (!regex.test(core)) continue;
    return `${leading}${core.replace(regex, pattern.replacement)}${trailing}`;
  }

  return source;
}

function translateAttributes(tag) {
  if (!/[A-Za-z]/.test(tag)) return tag;
  const isMeta = /^<meta\b/i.test(tag);
  return tag.replace(/\b([a-zA-Z:-]+)=("([^"]*)"|'([^']*)')/g, (full, rawName, quoted, doubleValue, singleValue) => {
    const name = String(rawName || "").toLowerCase();
    if (!ATTRIBUTE_NAMES.has(name) && !(isMeta && name === "content")) return full;
    const value = doubleValue !== undefined ? doubleValue : singleValue;
    const translated = translateChunk(value);
    if (translated === value) return full;
    const quote = quoted[0];
    return `${rawName}=${quote}${translated}${quote}`;
  });
}

function rewriteInternalAnchorHost(tag) {
  if (!/^<a\b/i.test(tag)) return tag;
  return tag.replace(/\bhref=("|')https:\/\/(?:www\.)?vixale\.com(?=\/|\1)([^"']*)\1/i, (full, quote, rest) => {
    return `href=${quote}https://${RU_HOST}${rest}${quote}`;
  });
}

function rewriteCanonicalTag(tag) {
  if (!/^<link\b/i.test(tag) || !/\brel=("|')canonical\1/i.test(tag)) return tag;
  return tag.replace(/\bhref=("|')https:\/\/(?:www\.)?vixale\.com(?=\/|\1)([^"']*)\1/i, (full, quote, rest) => {
    return `href=${quote}https://${RU_HOST}${rest}${quote}`;
  });
}

function rewriteOgUrlTag(tag) {
  if (!/^<meta\b/i.test(tag) || !/\b(?:property|name)=("|')og:url\1/i.test(tag)) return tag;
  return tag.replace(/\bcontent=("|')https:\/\/(?:www\.)?vixale\.com(?=\/|\1)([^"']*)\1/i, (full, quote, rest) => {
    return `content=${quote}https://${RU_HOST}${rest}${quote}`;
  });
}

function localizeSeoHosts(html, pathname) {
  let out = String(html);

  // Remove only alternates generated by this layer before rebuilding them. This
  // keeps repeated passes idempotent while preserving unrelated SEO tags.
  out = out.replace(/\s*<link\b[^>]*data-vx-ru-hreflang=["']1["'][^>]*>\s*/gi, "\n");
  out = out.replace(/\s*<link\b[^>]*data-vx-ru-hreflang=["']ru["'][^>]*>\s*/gi, "\n");
  out = out.replace(/\s*<link\b[^>]*data-vx-ru-hreflang=["']x-default["'][^>]*>\s*/gi, "\n");

  // Keep the English site's asset URLs byte-for-byte intact. Rewriting every
  // www.vixale.com URL can redirect stylesheets/images/assets to the RU host and
  // make the page render differently. Only navigation anchors and SEO URLs are
  // host-localized.
  out = out.split(/(<[^>]+>)/g).map(part => {
    if (!part || !part.startsWith("<")) return part;
    if (/^<(?:script|style|pre|code|textarea)\b/i.test(part)) return part;
    return rewriteOgUrlTag(rewriteCanonicalTag(rewriteInternalAnchorHost(part)));
  }).join("");

  if (/<\/head>/i.test(out)) {
    const path = pathname === "/" ? "/" : pathname;
    const alternates = [
      `<link data-vx-ru-hreflang="1" rel="alternate" hreflang="en" href="https://${EN_HOST}${path}">`,
      `<link data-vx-ru-hreflang="ru" rel="alternate" hreflang="ru" href="https://${RU_HOST}${path}">`,
      `<link data-vx-ru-hreflang="x-default" rel="alternate" hreflang="x-default" href="https://${EN_HOST}${path}">`,
    ].join("\n");
    out = out.replace(/<\/head>/i, `${alternates}\n</head>`);
  }

  return out;
}

function translateHtmlText(html) {
  const source = String(html ?? "");
  // Keep script/style/pre/code/textarea bodies byte-for-byte unchanged. This is
  // critical because presentation text can sit next to live-data and form logic.
  const protectedBlocks = [];
  let masked = source.replace(/<(script|style|pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, block => {
    const token = `\u0000VXRU${protectedBlocks.length}\u0000`;
    protectedBlocks.push(block);
    return token;
  });

  masked = masked.split(/(<[^>]+>)/g).map(part => {
    if (!part) return part;
    if (part.startsWith("<")) return translateAttributes(part);
    if (part.includes("\u0000VXRU")) return part;
    return translateChunk(part);
  }).join("");

  masked = masked.replace(/\u0000VXRU(\d+)\u0000/g, (_, index) => protectedBlocks[Number(index)] || "");
  return masked;
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildRuntimeLocalizationScript() {
  const entries = safeInlineJson(Array.from(TRANSLATION_MAP.entries()));
  const patterns = safeInlineJson(RUNTIME_TRANSLATION_PATTERNS);
  return `<script id="${RUNTIME_SCRIPT_ID}">(() => {
const map=new Map(${entries});
const patterns=${patterns};
const attrs=new Set(['placeholder','aria-label','title','alt']);
const blocked=new Set(['SCRIPT','STYLE','PRE','CODE','TEXTAREA','NOSCRIPT']);
const split=value=>{const source=String(value==null?'':value),leading=(source.match(/^\\s*/)||[''])[0],trailing=(source.match(/\\s*$/)||[''])[0],end=Math.max(leading.length,source.length-trailing.length);return{source,leading,core:source.slice(leading.length,end),trailing}};
const translated=value=>{const parts=split(value),core=parts.core;if(!/[A-Za-z]/.test(core))return parts.source;let out=map.get(core);if(out!==undefined){if(core.toUpperCase()===core&&/[A-Z]/.test(core))out=String(out).toUpperCase();return parts.leading+out+parts.trailing}for(const item of patterns){const re=new RegExp(item.source);if(re.test(core))return parts.leading+core.replace(re,item.replacement)+parts.trailing}return parts.source};
const localize=node=>{if(!node)return;if(node.nodeType===3){const next=translated(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next;return}if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;if(node.nodeType===1){if(blocked.has(node.tagName))return;for(const name of attrs){if(!node.hasAttribute(name))continue;const current=node.getAttribute(name),next=translated(current);if(next!==current)node.setAttribute(name,next)}}for(const child of Array.from(node.childNodes||[]))localize(child)};
const root=document.documentElement;if(!root)return;const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData'){localize(record.target);continue}if(record.type==='attributes'){localize(record.target);continue}for(const node of Array.from(record.addedNodes||[]))localize(node)}});observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:Array.from(attrs)});localize(root);root.setAttribute('data-vx-ru-runtime-localized','1');
})();</script>`;
}

function injectRuntimeLocalization(html) {
  const source = String(html ?? "");
  if (!source || source.includes(`id="${RUNTIME_SCRIPT_ID}"`)) return source;
  const script = buildRuntimeLocalizationScript();
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${script}\n</body>`);
  return `${source}${script}`;
}

function localizeRussianHtml(html, pathname = "/") {
  if (typeof html !== "string" || !/<html\b|<body\b|<!doctype\s+html/i.test(html)) return html;
  let out = String(html);
  out = out.replace(/<html\b([^>]*)\blang=("[^"]*"|'[^']*')([^>]*)>/i, `<html$1lang="${LOCALE}"$3>`);
  if (!/<html\b[^>]*\blang=/i.test(out)) out = out.replace(/<html\b/i, `<html lang="${LOCALE}"`);
  out = translateHtmlText(out);
  out = localizeSeoHosts(out, pathname);
  out = injectRuntimeLocalization(out);
  return out;
}

function installRussianLocalization(app) {
  app.use((req, res, next) => {
    const host = requestHost(req);
    const pathname = pathnameOf(req);
    if (!isRussianHost(host) || !isLocalizablePath(pathname)) return next();

    const send = res.send.bind(res);
    res.send = function sendRussian(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body === "string" && (!type || type.includes("text/html") || type.includes("html"))) {
        body = localizeRussianHtml(body, pathname);
      }
      return send(body);
    };
    return next();
  });
}

function restoreHeader(headers, name, hadValue, value) {
  if (!headers) return;
  if (hadValue) headers[name] = value;
  else delete headers[name];
}

function withCanonicalEnglishHomepageIdentity(req, callback) {
  const pathname = pathnameOf(req);
  if (pathname !== HOME_PATH || !isRussianHost(requestHost(req))) return callback();

  const headers = req?.headers;
  if (!headers) return callback();

  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const hadHost = hasOwn(headers, "host");
  const originalHost = headers.host;
  const hadForwardedHost = hasOwn(headers, "x-forwarded-host");
  const originalForwardedHost = headers["x-forwarded-host"];
  const query = req?.query && typeof req.query === "object" ? req.query : null;
  const hadLang = Boolean(query && hasOwn(query, "lang"));
  const originalLang = query?.lang;

  // app.js still contains a legacy renderLandingHtmlRu() selector for GET /.
  // The localization middleware above has already captured the real RU host, so
  // only while the root route handler chooses its renderer we present the EN
  // identity. The handler therefore emits the same canonical homepage HTML as
  // www.vixale.com, after which the already-installed RU response wrapper
  // translates that final refined HTML. This does not affect non-home routes.
  headers.host = EN_HOST;
  headers["x-forwarded-host"] = EN_HOST;
  if (query) delete query.lang;

  const restore = () => {
    restoreHeader(headers, "host", hadHost, originalHost);
    restoreHeader(headers, "x-forwarded-host", hadForwardedHost, originalForwardedHost);
    if (query) {
      if (hadLang) query.lang = originalLang;
      else delete query.lang;
    }
  };

  let result;
  try {
    result = callback();
  } catch (error) {
    restore();
    throw error;
  }

  if (result && typeof result.then === "function") {
    return result.then(
      value => {
        restore();
        return value;
      },
      error => {
        restore();
        throw error;
      }
    );
  }

  restore();
  return result;
}

function wrapHomepageRouteHandler(handler) {
  if (typeof handler !== "function") return handler;
  return function canonicalRussianHomepageHandler(req, res, next) {
    return withCanonicalEnglishHomepageIdentity(req, () => handler.call(this, req, res, next));
  };
}

function installRussianHomepageCanonicalRenderer(app) {
  if (!app || typeof app.get !== "function" || app.get.__vixaleRussianHomepageCanonicalWrapped) return app;
  const originalGet = app.get.bind(app);

  function getWithCanonicalRussianHomepage(path, ...handlers) {
    // Preserve Express app.get(setting) and every non-home route unchanged.
    if (path !== HOME_PATH || handlers.length === 0) return originalGet(path, ...handlers);
    return originalGet(path, ...handlers.map(wrapHomepageRouteHandler));
  }

  Object.defineProperty(getWithCanonicalRussianHomepage, "__vixaleRussianHomepageCanonicalWrapped", { value: true });
  app.get = getWithCanonicalRussianHomepage;
  return app;
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
  if (typeof factory !== "function" || factory.__vixaleRussianLocalizationWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installRussianLocalization(app);
    installRussianHomepageCanonicalRenderer(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleRussianLocalizationWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleRussianLocalizationModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  RU_HOST,
  EN_HOST,
  LOCALE,
  HOME_PATH,
  RUNTIME_SCRIPT_ID,
  PRIVATE_PREFIXES,
  TRANSLATIONS,
  TRANSLATION_MAP,
  RUNTIME_TRANSLATION_PATTERNS,
  normalizeHost,
  requestHost,
  isRussianHost,
  pathnameOf,
  isLocalizablePath,
  splitOuterWhitespace,
  translateChunk,
  translateRuntimeChunk,
  translateAttributes,
  rewriteInternalAnchorHost,
  rewriteCanonicalTag,
  rewriteOgUrlTag,
  translateHtmlText,
  localizeSeoHosts,
  buildRuntimeLocalizationScript,
  injectRuntimeLocalization,
  localizeRussianHtml,
  installRussianLocalization,
  withCanonicalEnglishHomepageIdentity,
  wrapHomepageRouteHandler,
  installRussianHomepageCanonicalRenderer,
  wrapExpress,
};
