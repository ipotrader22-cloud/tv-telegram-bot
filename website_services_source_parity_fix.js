"use strict";

const Module = require("module");

const SERVICES_PATH = "/services";
const SOURCE_MARKER_PREFIX = "vx-services-source-parity";

const SECTION_CONTRACTS = Object.freeze([
  Object.freeze({
    ids: Object.freeze(["appointment", "setup-call"]),
    canonicalId: "appointment",
    needle: "Book a quick setup call.",
  }),
  Object.freeze({
    ids: Object.freeze(["strategy-review", "strategy-rules"]),
    canonicalId: "strategy-review",
    needle: "Send us your trading rules.",
  }),
  Object.freeze({
    ids: Object.freeze(["bot-request", "bot-builder"]),
    canonicalId: "bot-request",
    needle: "Describe the trading bot you want.",
  }),
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const openEnd = html.indexOf(">", openStart);
  if (openEnd < 0) return null;
  const tagPattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return { start: openStart, end: tagPattern.lastIndex, openEnd: openEnd + 1 };
    }
  }
  return null;
}

function findSectionByAnyId(html, ids) {
  for (const id of ids) {
    const pattern = new RegExp(`<section\\b[^>]*\\bid=(["'])${escapeRegex(id)}\\1[^>]*>`, "i");
    const match = pattern.exec(html);
    if (match) return { id, match, range: findTagRangeFromOpen(html, "section", match.index) };
  }
  return null;
}

function normalizeSectionId(openTag, currentId, canonicalId) {
  if (!currentId || currentId === canonicalId) return openTag;
  const pattern = new RegExp(`\\bid=(["'])${escapeRegex(currentId)}\\1`, "i");
  return openTag.replace(pattern, `id="${canonicalId}"`);
}

function normalizePrimaryHeading(sectionHtml, headingText) {
  const source = String(sectionHtml || "");
  const match = /<h2\b([^>]*)>[\s\S]*?<\/h2>/i.exec(source);
  if (!match) return source;
  const replacement = `<h2${match[1]}>${headingText}</h2>`;
  return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
}

function prepareServicesSourceForPublicIa(html) {
  if (typeof html !== "string" || !html) return html;
  let out = html;

  for (const contract of SECTION_CONTRACTS) {
    const found = findSectionByAnyId(out, contract.ids);
    if (!found || !found.range) continue;

    const { range } = found;
    const originalOpenTag = out.slice(range.start, range.openEnd);
    const normalizedOpenTag = normalizeSectionId(originalOpenTag, found.id, contract.canonicalId);
    if (normalizedOpenTag !== originalOpenTag) {
      out = out.slice(0, range.start) + normalizedOpenTag + out.slice(range.openEnd);
    }

    let refreshed = findSectionByAnyId(out, [contract.canonicalId]);
    if (!refreshed || !refreshed.range) continue;

    const originalSection = out.slice(refreshed.range.start, refreshed.range.end);
    const normalizedSection = normalizePrimaryHeading(originalSection, contract.needle);
    if (normalizedSection !== originalSection) {
      out = out.slice(0, refreshed.range.start) + normalizedSection + out.slice(refreshed.range.end);
    }

    refreshed = findSectionByAnyId(out, [contract.canonicalId]);
    if (!refreshed || !refreshed.range) continue;
    const sectionHtml = out.slice(refreshed.range.start, refreshed.range.end);
    if (sectionHtml.includes(contract.needle)) continue;

    const marker = `<!-- ${SOURCE_MARKER_PREFIX}:${contract.needle} -->`;
    out = out.slice(0, refreshed.range.openEnd) + marker + out.slice(refreshed.range.openEnd);
  }

  return out;
}

function installServicesSourceParity(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || requestPath(req) !== SERVICES_PATH) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithServicesSourceParity(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (
        typeof body === "string" &&
        res.statusCode < 300 &&
        (!contentType || contentType.includes("html"))
      ) {
        body = prepareServicesSourceForPublicIa(body);
      }
      return originalSend(body);
    };
    return next();
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleServicesSourceParityWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installServicesSourceParity(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleServicesSourceParityWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleServicesSourceParityModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SERVICES_PATH,
  SOURCE_MARKER_PREFIX,
  SECTION_CONTRACTS,
  requestPath,
  findTagRangeFromOpen,
  findSectionByAnyId,
  normalizePrimaryHeading,
  prepareServicesSourceForPublicIa,
  installServicesSourceParity,
  wrapExpress,
};
