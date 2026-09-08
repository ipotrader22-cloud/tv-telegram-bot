"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SERVICES_PATH = "/services";
const PRICING_PATH = "/pricing";
const STYLE_ID = "vx-access-truth-style";
const FLOW_MARKER = "vx-access-truth-flow";
const SERVICES_INTRO_MARKER = "vx-services-intro";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const pattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  pattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: pattern.lastIndex };
  }
  return null;
}

function findSectionById(html, id) {
  const pattern = new RegExp(`<section\\b[^>]*\\bid=(["'])${escapeRegex(id)}\\1[^>]*>`, "i");
  const match = pattern.exec(html);
  if (!match) return null;
  return findTagRangeFromOpen(html, "section", match.index);
}

function normalizeDurationClaims(html) {
  let result = html;
  const replacements = [
    ["Request 7-Day Access", "Request Free Access"],
    ["7 Days Free", "Free Access"],
    ["Watch Vixale free for 7 days.", "Watch Vixale free before you decide."],
    ["Watch the read-only dashboard for 7 days before deciding what to do next.", "Watch the read-only dashboard before deciding what to do next."],
    ["Watch for 7 days", "Follow the systems"],
  ];
  for (const [from, to] of replacements) result = result.split(from).join(to);
  return result;
}

function renderAccessFlow() {
  return `<div class="${FLOW_MARKER}" aria-label="How free access works"><strong>How access works</strong><span>1. Request access</span><span>2. Verify your email</span><span>3. Await manual review</span><span>4. Receive your viewer code if approved</span><small>After submitting, check your Inbox and Spam/Junk folder for the verification email. Email confirmation does not grant access automatically.</small></div>`;
}

function injectHomeAccessFlow(html) {
  const range = findSectionById(html, "password-access");
  if (!range) return html;
  let section = html.slice(range.start, range.end);
  if (!section.includes(FLOW_MARKER)) {
    const formIndex = section.search(/<form\b/i);
    if (formIndex >= 0) section = section.slice(0, formIndex) + renderAccessFlow() + section.slice(formIndex);
  }
  section = section
    .split("Request Dashboard Access").join("Request Free Access")
    .split("Send a short access request. Every request is reviewed manually before an individual dashboard code is created.")
      .join("Send a short access request, verify your email, then wait for manual review. If approved, you will receive an individual viewer code by email.")
    .split("Once approved, you will receive a reply by email with the login instructions.")
      .join("After email confirmation and manual review, approved viewers receive an individual viewer code by email with login instructions.")
    .split("Reviewed. Access is never granted automatically.")
      .join("Verify first. Confirm your email before the request enters manual review.")
    .split("Direct. The approval response goes to your email.")
      .join("Reviewed manually. Access is never granted automatically.")
    .split("Private. Every approved viewer receives an individual access code.")
      .join("If approved. Your individual viewer code is sent by email.");
  return html.slice(0, range.start) + section + html.slice(range.end);
}

function refineHome(html) {
  let result = normalizeDurationClaims(html);
  result = result.split("Read-only dashboard · Manual approval · Individual access code")
    .join("Email verification · Manual review · Individual viewer code");
  result = injectHomeAccessFlow(result);
  return result;
}

function renderServicesIntro() {
  return `<section class="wrap section ${SERVICES_INTRO_MARKER}" aria-labelledby="vx-services-title"><div class="section-head"><div class="market-kicker"><span class="market-label">Services</span></div><h1 id="vx-services-title">Vixale Services</h1><p class="lead">Choose the level of help you need — from watching the systems to research, automation, and custom development.</p></div></section>`;
}

function injectServicesH1(html) {
  const mainStart = html.search(/<main\b/i);
  if (mainStart < 0) return html;
  const mainRange = findTagRangeFromOpen(html, "main", mainStart);
  if (!mainRange) return html;
  const mainHtml = html.slice(mainRange.start, mainRange.end);
  if (/<h1\b/i.test(mainHtml)) return html;
  const openEnd = html.indexOf(">", mainStart);
  if (openEnd < 0 || openEnd >= mainRange.end) return html;
  return html.slice(0, openEnd + 1) + `\n${renderServicesIntro()}\n` + html.slice(openEnd + 1);
}

function refineServices(html) {
  let result = normalizeDurationClaims(html);
  result = result.replace(/href=(["'])#(?:password-access|access)\1/gi, 'href="/#password-access"');
  result = result.split("Request Dashboard Access").join("Request Free Access");
  result = injectServicesH1(result);
  return result;
}

function renderPricingSteps() {
  return `<div class="vx-watch-steps vx-access-truth-steps"><div class="vx-watch-step"><b>1</b><div><strong>Request access</strong><span>Send the short access form.</span></div></div><div class="vx-watch-step"><b>2</b><div><strong>Verify your email</strong><span>Open the confirmation link. Check Inbox and Spam/Junk.</span></div></div><div class="vx-watch-step"><b>3</b><div><strong>Await manual review</strong><span>Email verification places your request into review. Access is never automatic.</span></div></div><div class="vx-watch-step"><b>4</b><div><strong>Receive your code</strong><span>If approved, your individual viewer code is sent by email.</span></div></div></div>`;
}

function replacePricingSteps(html) {
  const marker = '<div class="vx-watch-steps">';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const range = findTagRangeFromOpen(html, "div", start);
  if (!range) return html;
  return html.slice(0, range.start) + renderPricingSteps() + html.slice(range.end);
}

function refinePricing(html) {
  let result = normalizeDurationClaims(html);
  result = result.split("Read-only access · Manual approval · Individual dashboard code")
    .join("Email verification · Manual review · Individual viewer code");
  result = result.replace(/href=(["'])\/#access\1/gi, 'href="/#password-access"');
  result = replacePricingSteps(result);
  return result;
}

const styles = `
<style id="${STYLE_ID}">
  .${FLOW_MARKER}{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:18px 0 20px;padding:16px;border:1px solid #dce8e1;border-radius:18px;background:#f8fcfa;color:#58665f;font-size:12.5px;line-height:1.45}
  .${FLOW_MARKER}>strong{grid-column:1/-1;color:#17211d;font-size:13.5px;font-weight:650}
  .${FLOW_MARKER}>span{padding:9px 10px;border:1px solid #e3ebe6;border-radius:12px;background:#fff;color:#45534c}
  .${FLOW_MARKER}>small{grid-column:1/-1;color:#68736f;font-size:12px;line-height:1.5}
  .${SERVICES_INTRO_MARKER}{padding-top:54px;padding-bottom:10px}
  .${SERVICES_INTRO_MARKER} h1{margin:8px 0 0;color:#17211d;font-size:clamp(38px,5vw,56px);font-weight:500;line-height:1.04;letter-spacing:-.04em}
  .${SERVICES_INTRO_MARKER} .lead{max-width:760px;margin-top:14px}
  .vx-watch-steps.vx-access-truth-steps{grid-template-columns:repeat(4,minmax(0,1fr))}
  @media(max-width:820px){.${FLOW_MARKER}{grid-template-columns:1fr}.vx-watch-steps.vx-access-truth-steps{grid-template-columns:1fr}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refineAccessTruthHtml(html, path) {
  if (typeof html !== "string") return html;
  let result = html;
  if (path === HOME_PATH) result = refineHome(result);
  else if (path === SERVICES_PATH) result = refineServices(result);
  else if (path === PRICING_PATH) result = refinePricing(result);
  else return html;
  return injectStyles(result);
}

function installAccessTruthRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || ![HOME_PATH, SERVICES_PATH, PRICING_PATH].includes(path)) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithAccessTruth(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineAccessTruthHtml(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleAccessTruthWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installAccessTruthRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleAccessTruthWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleAccessTruthModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SERVICES_PATH,
  PRICING_PATH,
  STYLE_ID,
  FLOW_MARKER,
  SERVICES_INTRO_MARKER,
  findTagRangeFromOpen,
  findSectionById,
  normalizeDurationClaims,
  renderAccessFlow,
  injectHomeAccessFlow,
  refineHome,
  renderServicesIntro,
  injectServicesH1,
  refineServices,
  renderPricingSteps,
  replacePricingSteps,
  refinePricing,
  injectStyles,
  refineAccessTruthHtml,
  installAccessTruthRefinement,
  wrapExpress,
};
