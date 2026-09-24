"use strict";

const Module = require("module");

const SWING_PATH = "/trading-systems/swing-trading";
const MODEL_ALLOCATION_PER_POSITION = 10000;
const PAGE_MARKER = 'data-vx-swing-active-model-pnl="1"';
const STYLE_ID = "vx-swing-active-model-pnl-style";

const styles = `<style id="${STYLE_ID}">
.vx-model-shares,.vx-model-open-pnl{white-space:nowrap}
@media(max-width:720px){.vx-model-shares,.vx-model-open-pnl{white-space:normal}}
</style>`;

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function parseMoney(text) {
  const normalized = String(text || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim();
  const accounting = normalized.match(/\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\)/);
  if (accounting) return -Number(accounting[1].replace(/,/g, ""));
  const standard = normalized.match(/([+-]?)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!standard) return NaN;
  const value = Number(standard[2].replace(/,/g, ""));
  return standard[1] === "-" ? -value : value;
}

function formatShares(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const absolute = Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (number > 0) return `+$${absolute}`;
  if (number < 0) return `-$${absolute}`;
  return "$0.00";
}

function pnlClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "flat";
  return number > 0 ? "gain" : "loss";
}

function modelShares(entryPrice) {
  const entry = Number(entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) return NaN;
  return MODEL_ALLOCATION_PER_POSITION / entry;
}

function modelOpenPnl(entryPrice, currentPrice) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  const shares = modelShares(entry);
  if (!Number.isFinite(current) || !Number.isFinite(shares)) return NaN;
  return (current - entry) * shares;
}

function enhanceActiveRow(rowHtml) {
  if (typeof rowHtml !== "string" || /class=["'][^"']*\bempty\b/i.test(rowHtml)) return rowHtml;
  if (/data-label=["']Shares Quantity["']/i.test(rowHtml)) return rowHtml;

  const entryCell = rowHtml.match(/<td\b[^>]*data-label=["']Entry["'][^>]*>([\s\S]*?)<\/td>/i);
  const currentCell = rowHtml.match(/<td\b[^>]*data-label=["']Current["'][^>]*>([\s\S]*?)<\/td>/i);
  if (!entryCell || !currentCell) return rowHtml;

  const entryPrice = parseMoney(entryCell[1]);
  const currentPrice = parseMoney(currentCell[1]);
  const shares = modelShares(entryPrice);
  const pnl = modelOpenPnl(entryPrice, currentPrice);
  if (!Number.isFinite(shares) || !Number.isFinite(pnl)) return rowHtml;

  const insertion = `<td data-label="Shares Quantity" class="vx-model-shares">${formatShares(shares)}</td>`
    + `<td data-label="P&L, $" class="vx-model-open-pnl ${pnlClass(pnl)}">${formatMoney(pnl)}</td>`;
  return rowHtml.replace(currentCell[0], `${currentCell[0]}${insertion}`);
}

function enhanceActiveSection(sectionHtml) {
  if (typeof sectionHtml !== "string") return sectionHtml;
  let out = sectionHtml;
  out = out.replace(
    /<th>Current<\/th>\s*<th>Return<\/th>/i,
    "<th>Current</th><th>Shares Quantity</th><th>P&amp;L, $</th><th>Return</th>"
  );
  out = out.replace(/<tbody>([\s\S]*?)<\/tbody>/i, (tbody, body) => {
    const enhanced = body.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => enhanceActiveRow(row));
    return `<tbody>${enhanced}</tbody>`;
  });
  out = out.replace(/colspan=["']6["']/gi, 'colspan="8"');
  return out;
}

function injectStyles(html) {
  if (typeof html !== "string" || html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function enhanceActivePortfolioTable(html) {
  if (typeof html !== "string" || html.includes(PAGE_MARKER)) return html;
  let out = html.replace(
    /<section\b[^>]*class=["'][^"']*\bsection\b[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>\s*Active Portfolio\s*<\/h2>[\s\S]*?<\/section>/i,
    section => enhanceActiveSection(section)
  );
  out = injectStyles(out);
  return out.replace(/<body(\s[^>]*)?>/i, match => (
    match.includes(PAGE_MARKER) ? match : match.replace("<body", `<body ${PAGE_MARKER}`)
  ));
}

function installSwingActiveModelPnl(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const method = String(req.method || "GET").toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || pathname !== SWING_PATH) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingActiveModelPnl(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = enhanceActivePortfolioTable(body);
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
  if (typeof factory !== "function" || factory.__vixaleSwingActiveModelPnlWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installSwingActiveModelPnl(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleSwingActiveModelPnlWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingActiveModelPnlModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  MODEL_ALLOCATION_PER_POSITION,
  PAGE_MARKER,
  STYLE_ID,
  requestPath,
  parseMoney,
  formatShares,
  formatMoney,
  pnlClass,
  modelShares,
  modelOpenPnl,
  enhanceActiveRow,
  enhanceActiveSection,
  enhanceActivePortfolioTable,
  injectStyles,
  installSwingActiveModelPnl,
  wrapExpress,
};
