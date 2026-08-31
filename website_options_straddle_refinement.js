"use strict";

const Module = require("module");
const fs = require("fs");
const path = require("path");

const GUIDE_PATH = "/trading-guide";
const SYSTEMS_PATH = "/trading-systems";
const PDF_ROUTE = "/download/trading-guide.pdf";
const PDF_BASE64_PATH = path.join(__dirname, "Vixale_Trading_Guide.pdf.b64");

function replaceAllLiteral(value, from, to) {
  return value.split(from).join(to);
}

function refineOptionsStraddleHtml(html) {
  if (typeof html !== "string") return html;

  let result = html;
  const replacements = [
    ["Options · Straddles", "Options · ES Straddles"],
    ["Watch → Straddle → +10% → Follow Updates", "Watch → Sell ES Straddle → ~10% Buyback → Follow Updates"],
    ["Enter the specified call + put combination in your broker platform.", "SELL the specified ES call + put combination in your broker platform for the published credit."],
    ["Place the profit-taking limit at +10% above total straddle debit.", "After the credit fill, place a BUY TO CLOSE limit about 10% below the entry credit, rounded to the nearest 0.25."],
    ["1 SPY straddle @ $10.00 debit = $1,000 · TGT $11.00", "SELL 1 ES straddle @ 33.00 credit · BUY TO CLOSE @ 29.75 · multiplier 50"],
    ["Target: +$100", "Target: +$162.50"],
    ["Open the straddle", "Sell the ES straddle"],
    ["Use your broker platform to open the specified call and put combination from the published instruction.", "Use your broker platform to SELL the specified ES call and put at the same strike for the published credit."],
    ["Place a +10% target", "Place the buyback target"],
    ["Set the profit-taking limit 10% above the total debit paid for the straddle.", "After the short straddle fills for a credit, place a BUY TO CLOSE limit about 10% below the entry credit. Round the target to the nearest 0.25 ES option price increment."],
    ["SPY straddle example", "ES short straddle example"],
    ["1 SPY STRADDLE @ $10.00 TOTAL DEBIT<br>100× multiplier = $1,000 cost", "SELL 1 ES STRADDLE @ 33.00 CREDIT<br>ES multiplier = 50"],
    ["<div class=\"row\"><span>+10% target value</span><b>$11.00</b></div>", "<div class=\"row\"><span>10% buyback calculation</span><b>33.00 × 0.90 = 29.70</b></div>"],
    ["<div class=\"row\"><span>Target proceeds</span><b>$1,100</b></div>", "<div class=\"row\"><span>Rounded BUY TO CLOSE limit</span><b>29.75 (nearest 0.25)</b></div>"],
    ["If target fills</span><b class=\"positive\">+$100", "If target fills</span><b class=\"positive\">+$162.50"],
    ["Options results depend on actual fills, bid/ask spreads, commissions, and the exact contracts specified in the signal.", "Short straddles are opened for credit. Profit is the entry credit minus the buyback price, multiplied by 50 for ES. Actual results depend on fills, bid/ask spreads, commissions, margin requirements, and later hedge or exit instructions."],
    ["6:00–8:30 PM ET → open straddle → +10% target → follow hedge/exit updates.", "6:00–8:30 PM ET → sell ES straddle for credit → buy back about 10% lower → follow hedge/exit updates."],
  ];

  for (const [from, to] of replacements) result = replaceAllLiteral(result, from, to);
  return result;
}

function readUpdatedPdfBuffer() {
  const encoded = fs.readFileSync(PDF_BASE64_PATH, "utf8").trim();
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 1000 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Invalid Trading Guide PDF source");
  }
  return buffer;
}

function installOptionsStraddleMiddleware(app) {
  app.use((req, res, next) => {
    const requestPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";

    if (isRead && requestPath === PDF_ROUTE) {
      try {
        const pdf = readUpdatedPdfBuffer();
        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="Vixale_Trading_Guide.pdf"');
        res.setHeader("Content-Length", String(pdf.length));
        res.send(pdf);
      } catch (error) {
        next(error);
      }
      return;
    }

    if (isRead && (requestPath === GUIDE_PATH || requestPath === SYSTEMS_PATH)) {
      const originalSend = res.send.bind(res);
      res.send = function sendWithEsShortStraddle(body) {
        const contentType = String(res.getHeader("Content-Type") || "");
        if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
          body = refineOptionsStraddleHtml(body);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleEsStraddleWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installOptionsStraddleMiddleware(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleEsStraddleWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleEsStraddleModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  GUIDE_PATH,
  SYSTEMS_PATH,
  PDF_ROUTE,
  PDF_BASE64_PATH,
  refineOptionsStraddleHtml,
  readUpdatedPdfBuffer,
  installOptionsStraddleMiddleware,
  wrapExpress,
};
