"use strict";

const Module = require("module");
const riskCopy = require("./lib/swing-risk-copy");

const SWING_PATH = "/trading-systems/swing-trading";
const GUIDE_PATH = "/trading-guide";
const SYSTEMS_PATH = "/trading-systems";
const REVIEW_WINDOW = "10:00–11:00 AM ET";

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "").split("?")[0];
}

function alignSwingPublicCopy(html) {
  if (typeof html !== "string") return html;
  let out = html;
  const replacements = [
    ["Review the Swing Trading Active Portfolio around 9:45–10:00 AM ET on each trading day.", `Research rankings update during ${REVIEW_WINDOW}. Opening stops may change holdings at 9:30 AM ET; review additions and removals after publication.`],
    ["Check for updates each trading morning from 9:45–10:00 AM ET.", `Research rankings update during ${REVIEW_WINDOW}; opening stops are checked at 9:30 AM ET.`],
    ["Active Portfolio at 9:45–10:00 AM ET → new additions → +10% / -5% → close removals.", `Opening stop at 9:30 AM ET → research rankings during ${REVIEW_WINDOW} → +10% GTC target → market exit on a score removal.`],
    ["Check 9:45–10:00 AM ET", `Check ${REVIEW_WINDOW}`],
    ["Use a +10% target and a -5% stop from your actual entry price.", `From your actual entry price, place the +10% profit target as a GTC sell limit. ${riskCopy.guideStop}`],
    ["From your actual entry price, use a +10% profit target and a -5% stop.", `From your actual entry price, place the +10% profit target as a GTC sell limit. ${riskCopy.guideStop}`],
    ["5% stop level, evaluated on the daily close.", riskCopy.guideStop],
    ["9:45–10:00 AM ET", REVIEW_WINDOW],
    ["9:45-10:00 AM ET", "10:00-11:00 AM ET"],
  ];
  for (const [from, to] of replacements) out = out.split(from).join(to);

  out = out.split("When a new symbol appears, enter at the current market price.").join("When a new symbol appears in Active Portfolio, act on the addition as soon as practical and record your actual fill price.");
  out = out.split("If the symbol drops off Active Portfolio, close at market as soon as practical.").join(riskCopy.score + " Do not wait for the original target or stop.");
  out = out.split("A portfolio removal is an exit instruction. Actual market fills can differ from the example price.").join("A portfolio removal is an independent exit instruction. Actual market fills can differ from the example price; the +10% target may execute intraday, while the opening stop uses the regular-session 9:30 AM ET opening price.");
  return out;
}

function refineSwingInstructionalHtml(html, pathname) {
  if (typeof html !== "string") return html;
  if (![SWING_PATH, GUIDE_PATH, SYSTEMS_PATH].includes(pathname)) return html;
  return alignSwingPublicCopy(html);
}

function installSwingInstructionalRefinement(app) {
  app.use((req, res, next) => {
    const pathname = requestPath(req);
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || ![SWING_PATH, GUIDE_PATH, SYSTEMS_PATH].includes(pathname)) return next();

    const send = res.send.bind(res);
    res.send = function sendSwingInstructional(body) {
      const contentType = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        body = refineSwingInstructionalHtml(body, pathname);
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
    if (!descriptor) continue;
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleSwingInstructionalWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installSwingInstructionalRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleSwingInstructionalWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleSwingInstructionalModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  SWING_PATH,
  GUIDE_PATH,
  SYSTEMS_PATH,
  REVIEW_WINDOW,
  requestPath,
  alignSwingPublicCopy,
  refineSwingInstructionalHtml,
  installSwingInstructionalRefinement,
  wrapExpress,
};

