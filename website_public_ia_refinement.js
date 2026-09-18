"use strict";

const Module = require("module");

const HOME_PATH = "/";
const SYSTEMS_PATH = "/trading-systems";
const SERVICES_PATH = "/services";
const RESULTS_PATH = "/results";
const ACCESS_PATH = "/access";
const PRICING_PATH = "/pricing";
const RISK_PATH = "/risk-management";
const RISK_NAV_MARKER = "vx-risk-management-nav-link";
const PRICING_STYLE_ID = "vx-pricing-access-style";
const SERVICES_INTRO_MARKER = "vx-services-intro";
const SERVICES_OFFER_MARKER = "vx-services-offer";
const SERVICES_OFFER_STYLE_ID = "vx-services-offer-style";
const RESULTS_STYLE_ID = "vx-results-hub-style";
const ACCESS_STYLE_ID = "vx-access-journey-style";

const SERVICE_SECTION_NEEDLES = [
  "What can we help you with?",
  "Book a quick setup call.",
  "Describe the trading bot you want.",
  "Send us your trading rules.",
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceDirectTextNavLink(html, oldText, href, newText) {
  const pattern = new RegExp(`<a\\b([^>]*)>\\s*${escapeRegex(oldText)}\\s*<\\/a>`, "g");
  return html.replace(pattern, `<a href="${href}">${newText}</a>`);
}

function removeDirectTextNavLink(html, text) {
  const pattern = new RegExp(`\\s*<a\\b[^>]*>\\s*${escapeRegex(text)}\\s*<\\/a>`, "g");
  return html.replace(pattern, "");
}

function replaceAllLiteral(html, oldText, newText) {
  return String(html).split(oldText).join(newText);
}

function transformPrimaryNav(html) {
  let result = html;
  result = removeDirectTextNavLink(result, "Risk Management");
  result = replaceDirectTextNavLink(result, "Why It Makes Sense", SERVICES_PATH, "Services");
  result = replaceDirectTextNavLink(result, "Creators", PRICING_PATH, "Watch System for Free");
  result = replaceDirectTextNavLink(result, "7 Days Free", PRICING_PATH, "Watch System for Free");
  return result;
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
    const token = match[0];
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(token);
    if (isClose) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return {
        start: openStart,
        end: tagPattern.lastIndex,
        openEnd: openEnd + 1,
        closeStart: match.index,
      };
    }
  }
  return null;
}

function findEnclosingTagRangeByText(html, tagName, text) {
  const textIndex = html.indexOf(text);
  if (textIndex < 0) return null;
  const openStart = html.lastIndexOf(`<${tagName}`, textIndex);
  if (openStart < 0) return null;
  const range = findTagRangeFromOpen(html, tagName, openStart);
  if (!range || range.end < textIndex) return null;
  return range;
}

function extractSectionByText(html, text) {
  const range = findEnclosingTagRangeByText(html, "section", text);
  return range ? html.slice(range.start, range.end) : "";
}

function removeSectionsByText(html, texts) {
  const ranges = [];
  const seen = new Set();
  for (const text of texts) {
    const range = findEnclosingTagRangeByText(html, "section", text);
    if (!range) continue;
    const key = `${range.start}:${range.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      ranges.push(range);
    }
  }
  ranges.sort((a, b) => b.start - a.start);
  let result = html;
  for (const range of ranges) result = result.slice(0, range.start) + result.slice(range.end);
  return result;
}

function replaceMainContents(html, innerHtml) {
  const mainStart = html.search(/<main\b/i);
  if (mainStart < 0) return html;
  const range = findTagRangeFromOpen(html, "main", mainStart);
  if (!range) return html;
  return html.slice(0, range.openEnd) + `\n${innerHtml}\n` + html.slice(range.closeStart);
}

function updateTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html;
}

function updateCanonical(html, path) {
  const linkPattern = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
  const match = html.match(linkPattern);
  if (!match) return html;
  const updated = match[0].replace(/href=["'][^"']*["']/i, `href="https://www.vixale.com${path}"`);
  return html.replace(match[0], updated);
}

function normalizeHeaderHashLinksToHome(html) {
  const navNeedle = "Live System";
  const navRange = findEnclosingTagRangeByText(html, "nav", navNeedle);
  if (!navRange) return html;
  const navHtml = html.slice(navRange.start, navRange.end).replace(/href=["']#([^"']*)["']/g, 'href="/#$1"');
  return html.slice(0, navRange.start) + navHtml + html.slice(navRange.end);
}

function normalizeAccessLinksToHome(html) {
  return String(html).replace(/href=(["'])(?:\/services)?#password-access\1/gi, 'href="/#password-access"');
}

function normalizeAccessLinksToAccessPage(html) {
  return String(html)
    .replace(/href=(["'])(?:\/services)?#password-access\1/gi, 'href="/access"')
    .replace(/href=(["'])\/#password-access\1/gi, 'href="/access"');
}

function findSectionById(html, id) {
  const pattern = new RegExp(`<section\\b[^>]*\\bid=(["'])${escapeRegex(id)}\\1[^>]*>`, "i");
  const match = pattern.exec(String(html || ""));
  return match ? findTagRangeFromOpen(html, "section", match.index) : null;
}

function accessContext(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "day-trading") return { key, label: "Day Trading", source: "Access page · Day Trading" };
  if (key === "swing-trading") return { key, label: "Swing Trading", source: "Access page · Swing Trading" };
  if (key === "options") return { key, label: "Options", source: "Access page · Options" };
  return { key: "", label: "", source: "Access page" };
}

function replaceAccessFormSource(sectionHtml, source) {
  return String(sectionHtml || "").replace(
    /(<input\b[^>]*\bname=["']source["'][^>]*\bvalue=["'])[^"']*(["'][^>]*>)/i,
    `$1${String(source || "Access page").replace(/&/g, "&amp;").replace(/"/g, "&quot;")}$2`
  );
}

function refineHomeAccessCopy(html) {
  let result = html;
  const replacements = [
    ["Request 7-Day Access", "Request Free Access"],
    ["Read-only dashboard · Manual approval · Individual access code", "Read-only access · Email verification · Manual review"],
    ["Private dashboard access", "Free viewer access"],
    ["Request access to the live dashboard.", "Request free access to Vixale."],
    ["Send a short access request. Every request is reviewed manually before an individual dashboard code is created.", "Submit the form, verify your email, and wait for manual review. If approved, we'll email your individual viewer code."],
    ["Send a short access request. Approved viewers receive an individual dashboard code by email.", "Submit the form, verify your email, and wait for manual review. If approved, we'll email your individual viewer code."],
    ["Once approved, you will receive a reply by email with the login instructions.", "After you submit, check your Inbox and Spam/Junk for the one-time verification link."],
    ["Reviewed. Access is never granted automatically.", "Verify your email. Use the one-time confirmation link we send after you submit."],
    ["Direct. The approval response goes to your email.", "Manual review. Verified requests are reviewed before access is approved."],
    ["Private. Every approved viewer receives an individual access code.", "One viewer code. If approved, your code gives viewer access across Vixale systems."],
    ["Request Dashboard Access", "Request Free Access"],
    ["Your request is reviewed manually. Trading involves risk and results are not guaranteed.", "Email verification is required. Access is not granted automatically. Trading involves risk and results are not guaranteed."],
  ];
  for (const [oldText, newText] of replacements) result = replaceAllLiteral(result, oldText, newText);
  return result;
}

function renderServicesIntro() {
  return `<section class="wrap section ${SERVICES_INTRO_MARKER}" aria-labelledby="vx-services-title"><div class="section-head"><div class="section-kicker">Services</div><h1 id="vx-services-title">Vixale Services</h1><p class="lead">Explore Vixale research, automation, TradingView, and custom development services.</p></div></section>`;
}

const servicesOfferStyles = `
<style id="${SERVICES_OFFER_STYLE_ID}">
  .${SERVICES_OFFER_MARKER}{max-width:1180px;margin:0 auto;padding:0 24px 44px;box-sizing:border-box}.vx-services-offer-head{max-width:760px}.vx-services-offer-head h2{margin:0;color:#17211d;font-size:clamp(28px,3.4vw,40px);font-weight:520;letter-spacing:-.035em}.vx-services-offer-head p{margin:12px 0 0;color:#56645e;font-size:15px;line-height:1.6}.vx-services-offer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px}.vx-services-offer-card{display:flex;min-height:238px;flex-direction:column;padding:24px;border:1px solid #dbe7e0;border-radius:23px;background:#fff;box-shadow:0 14px 38px rgba(24,54,42,.045)}.vx-services-offer-card>span{color:#287153;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.vx-services-offer-card h3{margin:10px 0 0;color:#17211d;font-size:24px;font-weight:550;letter-spacing:-.025em}.vx-services-offer-card p{margin:9px 0 0;color:#56645e;font-size:13.5px;line-height:1.55}.vx-services-offer-card a{display:inline-flex;align-items:center;margin-top:auto;padding-top:18px;color:#176442;font-size:12.5px;font-weight:700;text-decoration:none}.vx-services-boundary{margin-top:16px;padding:16px 18px;border:1px solid #dce8e1;border-radius:17px;background:#f6faf8;color:#4d5c55;font-size:12.8px;line-height:1.55}.vx-services-boundary strong{color:#17211d}@media(max-width:760px){.${SERVICES_OFFER_MARKER}{padding:0 16px 36px}.vx-services-offer-grid{grid-template-columns:1fr}.vx-services-offer-card{min-height:0;padding:21px}}
</style>`;

function injectServicesOfferStyles(html) {
  if (html.includes(`id="${SERVICES_OFFER_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", () => `${servicesOfferStyles}
</head>`) : `${servicesOfferStyles}${html}`;
}

function renderServicesOffer() {
  return `<section class="${SERVICES_OFFER_MARKER}" aria-labelledby="vx-services-offer-title"><div class="vx-services-offer-head"><h2 id="vx-services-offer-title">Choose the kind of help you need.</h2><p>Start with free read-only access, or use a consultation to define research access, automation setup, or custom development. Custom work is scoped and quoted before it starts.</p></div><div class="vx-services-offer-grid">
    <article class="vx-services-offer-card"><span>Observe</span><h3>Viewer Access</h3><p>Review the public performance evidence and, if approved, use read-only viewer access for the Day Trading and Options evidence pages.</p><a href="/access">Request Free Access →</a></article>
    <article class="vx-services-offer-card"><span>Research</span><h3>Signals &amp; Research Access</h3><p>Discuss the signals and research access currently available for your use case. The consultation clarifies supported scope, delivery/access method, and onboarding next steps.</p><a href="#appointment">Discuss research access →</a></article>
    <article class="vx-services-offer-card"><span>Setup</span><h3>Automation Setup</h3><p>Get help planning supported TradingView alert, webhook, and automation setup. A setup consultation produces an implementation checklist and identifies any custom work that needs a quote before it starts.</p><a href="#appointment">Book setup consultation →</a></article>
    <article class="vx-services-offer-card"><span>Build</span><h3>Custom Development</h3><p>Scope a bot, dashboard, or integration around documented requirements. The scoping conversation produces assumptions, deliverables, dependencies, and a quote before development begins.</p><a href="#bot-request">Request a quote →</a></article>
  </div><div class="vx-services-boundary"><strong>Important boundary:</strong> Vixale does not trade or manage customer brokerage accounts. Services cover read-only access, research, setup assistance, and scoped development.</div></section>`;
}

function refineHomeHtml(html) {
  if (typeof html !== "string") return html;
  let result = transformPrimaryNav(html);
  result = removeSectionsByText(result, SERVICE_SECTION_NEEDLES);
  result = refineHomeAccessCopy(result);
  return result;
}

function renderServicesFromLanding(html) {
  if (typeof html !== "string") return html;
  const sections = SERVICE_SECTION_NEEDLES.map((needle) => extractSectionByText(html, needle)).filter(Boolean);
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  if (sections.length) result = replaceMainContents(result, [renderServicesIntro(), renderServicesOffer(), ...sections].join("\n\n"));
  result = normalizeAccessLinksToAccessPage(result);
  result = injectServicesOfferStyles(result);
  result = replaceAllLiteral(result, "Request Dashboard Access", "Request Free Access");
  result = updateTitle(result, "Vixale | Services");
  result = updateCanonical(result, SERVICES_PATH);
  return result;
}

const accessStyles = `
<style id="${ACCESS_STYLE_ID}">
  .vx-access-page{min-height:calc(100vh - 170px);padding:60px 0 86px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 62%);color:#17211d}
  .vx-access-page>.wrap{max-width:1120px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-access-head{max-width:850px}.vx-access-kicker{color:#287153;font-size:11px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
  .vx-access-head h1{margin:12px 0 0;font-size:clamp(42px,5vw,60px);font-weight:520;line-height:1.04;letter-spacing:-.04em}
  .vx-access-head p{max-width:780px;margin:16px 0 0;color:#56645e;font-size:16px;line-height:1.62}
  .vx-access-context{display:inline-flex;margin-top:18px;padding:8px 11px;border:1px solid #cfe4d8;border-radius:999px;background:#f3faf6;color:#176442;font-size:12px;font-weight:700}
  .vx-access-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:30px}
  .vx-access-step{padding:17px;border-top:2px solid #d7e6de;background:#fff}.vx-access-step b{display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:50%;background:#eef8f3;color:#176442;font-size:11px}.vx-access-step strong{display:block;margin-top:10px;font-size:13.5px}.vx-access-step span{display:block;margin-top:5px;color:#5f6d67;font-size:12.5px;line-height:1.48}
  .vx-access-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}.vx-access-fact{padding:20px;border:1px solid #dce7e1;border-radius:19px;background:#fff}.vx-access-fact strong{display:block;font-size:14px}.vx-access-fact p{margin:7px 0 0;color:#5f6d67;font-size:13px;line-height:1.55}.vx-access-fact a{color:#176442;font-weight:700;text-decoration:none}
  .vx-access-page #password-access{margin-top:34px!important}.vx-access-page #password-access .strategy-form-box{margin-top:0}
  .vx-access-foot{margin-top:22px;color:#65716c;font-size:12.5px;line-height:1.55}.vx-access-foot a{color:#176442;font-weight:700}
  @media(max-width:900px){.vx-access-steps{grid-template-columns:1fr 1fr}.vx-access-facts{grid-template-columns:1fr}}
  @media(max-width:640px){.vx-access-page{padding:44px 0 66px}.vx-access-page>.wrap{padding:0 16px}.vx-access-head h1{font-size:clamp(34px,10vw,42px)}.vx-access-steps{grid-template-columns:1fr}.vx-access-step{padding:15px 0}.vx-access-fact{padding:18px}}
</style>`;

function injectAccessStyles(html) {
  if (html.includes(`id="${ACCESS_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${accessStyles}\n</head>`) : `${accessStyles}${html}`;
}

function renderAccessJourney(formSection, context = accessContext("")) {
  const contextNote = context.label
    ? `<div class="vx-access-context">Access request started from ${context.label}</div>`
    : "";
  return `<section class="vx-access-page"><div class="wrap">
    <div class="vx-access-head"><div class="vx-access-kicker">Free Access</div><h1>Request read-only Vixale viewer access.</h1><p>Review public evidence first, then use this form if protected viewer detail is useful. Access is free, requires email verification and manual approval, and never gives Vixale control of your brokerage account.</p>${contextNote}</div>
    <div class="vx-access-steps" aria-label="Access process">
      <div class="vx-access-step"><b>1</b><strong>Request access</strong><span>Submit the form below.</span></div>
      <div class="vx-access-step"><b>2</b><strong>Verify email</strong><span>Use the one-time confirmation link. The verification link expires after 60 minutes.</span></div>
      <div class="vx-access-step"><b>3</b><strong>Manual review</strong><span>Verified requests are reviewed by the owner. Approval is not automatic.</span></div>
      <div class="vx-access-step"><b>4</b><strong>Receive viewer code</strong><span>If approved, your individual viewer code is sent by email.</span></div>
      <div class="vx-access-step"><b>5</b><strong>Log in</strong><span>Enter that code on the Vixale Log In page.</span></div>
    </div>
    <div class="vx-access-facts">
      <article class="vx-access-fact"><strong>What access opens</strong><p>Approved viewer access opens the read-only Day Trading dashboard and the protected Options viewer. The Swing research/model portfolio is already public and does not require login.</p></article>
      <article class="vx-access-fact"><strong>Email not visible?</strong><p>Check Inbox and Spam/Junk for the verification email before submitting again. The verification link itself is valid for 60 minutes.</p></article>
      <article class="vx-access-fact"><strong>Duration / expiration</strong><p>Access is free. Each approved viewer code has its own expiration date; no fixed public access duration is promised on this page. After a code expires, it will no longer log in.</p></article>
      <article class="vx-access-fact"><strong>Need help?</strong><p>Use <a href="/trading-guide">Help</a> if you are unsure what the viewer contains or submit a new access request if an earlier viewer code has expired.</p></article>
    </div>
    ${formSection}
    <div class="vx-access-foot">Existing approved viewer? <a href="/login">Log In with your viewer code</a>. Legacy links to <code>/#password-access</code> remain supported.</div>
  </div></section>`;
}

function renderAccessFromLanding(html, rawContext = "") {
  if (typeof html !== "string") return html;
  let result = transformPrimaryNav(html);
  result = refineHomeAccessCopy(result);
  const range = findSectionById(result, "password-access");
  if (!range) return html;
  const context = accessContext(rawContext);
  const formSection = replaceAccessFormSource(result.slice(range.start, range.end), context.source);
  result = normalizeHeaderHashLinksToHome(result);
  result = replaceMainContents(result, renderAccessJourney(formSection, context));
  result = injectAccessStyles(result);
  result = updateTitle(result, "Vixale | Request Free Access");
  result = updateCanonical(result, ACCESS_PATH);
  return result;
}

const resultsStyles = `
<style id="${RESULTS_STYLE_ID}">
  .vx-results-page{min-height:calc(100vh - 170px);padding:64px 0 88px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 60%);color:#17211d}
  .vx-results-page .wrap{max-width:1120px;margin:0 auto;padding:0 24px;box-sizing:border-box}
  .vx-results-head{max-width:820px}.vx-results-kicker{color:#287153;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .vx-results-head h1{margin:12px 0 0;font-size:clamp(40px,5vw,58px);font-weight:520;line-height:1.05;letter-spacing:-.04em}
  .vx-results-head p{max-width:760px;margin:16px 0 0;color:#56645e;font-size:16px;line-height:1.6}
  .vx-results-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:34px}
  .vx-results-card{display:flex;min-height:330px;flex-direction:column;padding:24px;border:1px solid #dce7e1;border-radius:24px;background:#fff;box-shadow:0 14px 38px rgba(31,67,51,.05)}
  .vx-results-card>span{color:#287153;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .vx-results-card h2{margin:10px 0 0;font-size:27px;font-weight:550;letter-spacing:-.03em}
  .vx-results-card p{margin:10px 0 0;color:#56645e;font-size:13.5px;line-height:1.55}
  .vx-results-card strong{display:block;margin-top:17px;font-size:12.5px;font-weight:700;color:#425049}
  .vx-results-links{display:grid;gap:8px;margin-top:auto;padding-top:20px}.vx-results-links a{color:#176442;font-size:12.5px;font-weight:700;text-decoration:none}.vx-results-links a:hover{text-decoration:underline;text-underline-offset:3px}
  .vx-results-boundary{margin-top:18px;padding:17px 19px;border:1px solid #dce8e1;border-radius:18px;background:#f6faf8;color:#4d5c55;font-size:12.8px;line-height:1.55}
  @media(max-width:860px){.vx-results-grid{grid-template-columns:1fr}.vx-results-card{min-height:0}}
  @media(max-width:640px){.vx-results-page{padding:46px 0 68px}.vx-results-page .wrap{padding:0 16px}.vx-results-head h1{font-size:clamp(34px,10vw,42px)}}
</style>`;

function injectResultsStyles(html) {
  if (html.includes(`id="${RESULTS_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${resultsStyles}\n</head>`) : `${resultsStyles}${html}`;
}

function renderResultsHub() {
  return `<section class="vx-results-page"><div class="wrap"><div class="vx-results-head"><div class="vx-results-kicker">Results</div><h1>Review the right evidence for each Vixale system.</h1><p>Day Trading, Swing Trading, and Options use different evidence sources. This page keeps those records separate so a visitor is never sent to one system's results while evaluating another.</p></div><div class="vx-results-grid">
    <article class="vx-results-card" id="day-trading"><span>Day Trading</span><h2>Realized and live Day Trading evidence</h2><p>The public Day Trading block shows current system status and realized P&amp;L from the Day Trading Closed Trades ledger. The archive provides the public closed-trade record.</p><strong>Execution-backed Day Trading evidence where recorded by the existing ledger.</strong><div class="vx-results-links"><a href="/#live-day-trading">View Day Trading results →</a><a href="/closed-trades">Open Day Trading closed-trades archive →</a></div></article>
    <article class="vx-results-card" id="swing-trading"><span>Swing Trading</span><h2>Research/model portfolio evidence</h2><p>Swing Trading publishes the Swing Leaders research/model portfolio, including Active Portfolio, closed model positions, and Swing Equity History.</p><strong>Research/model portfolio only — not broker execution or brokerage-account performance.</strong><div class="vx-results-links"><a href="/trading-systems/swing-trading">View Swing Portfolio →</a></div></article>
    <article class="vx-results-card" id="options"><span>Options</span><h2>Options-specific evidence</h2><p>The public Options page explains the owner-entered Option Journal. Detailed journal records, realized Options equity, and available owner-provided brokerage screenshots remain behind existing viewer access.</p><strong>Options evidence stays separate from Day Trading performance.</strong><div class="vx-results-links"><a href="/trading-systems/options">Review Options evidence →</a><a href="/trading-systems/options/viewer">Options Viewer →</a></div></article>
  </div><div class="vx-results-boundary">Evidence types are intentionally not presented as one homogeneous performance record. Each system keeps its existing source, access boundary, and disclosure.</div></div></section>`;
}

function renderResultsFromLanding(html) {
  if (typeof html !== "string") return html;
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  result = replaceMainContents(result, renderResultsHub());
  result = injectResultsStyles(result);
  result = updateTitle(result, "Vixale | Results");
  result = updateCanonical(result, RESULTS_PATH);
  return result;
}

const pricingStyles = `
<style id="${PRICING_STYLE_ID}">
  .vx-trial-page{min-height:calc(100vh - 170px);padding:76px 0 96px;background:linear-gradient(180deg,#f5fbf7 0%,#fff 58%)}
  .vx-trial-hero{max-width:940px;margin:0 auto;text-align:center}
  .vx-trial-kicker{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border:1px solid #bfead5;border-radius:999px;background:#f4fbf7;color:#176442;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-trial-hero h1{max-width:820px;margin:18px auto 0;color:#17211d;font-size:clamp(42px,6vw,68px);line-height:1.02;letter-spacing:-.045em;font-weight:500}
  .vx-trial-lead{max-width:760px;margin:20px auto 0;color:#68736f;font-size:17px;line-height:1.65}
  .vx-trial-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:28px}
  .vx-trial-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #cbdad2;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:13px;font-weight:650}
  .vx-trial-btn.primary{border-color:#078f51;background:#078f51;color:#fff}
  .vx-trial-btn:hover{transform:translateY(-1px)}
  .vx-trial-review{max-width:720px;margin:16px auto 0;color:#7a8580;font-size:12.5px;line-height:1.55}
  .vx-trial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:1000px;margin:52px auto 0}
  .vx-trial-card{padding:28px;border:1px solid #dbe7e0;border-radius:24px;background:rgba(255,255,255,.92);box-shadow:0 14px 38px rgba(24,54,42,.05)}
  .vx-trial-card-kicker{color:#2d7a58;font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}
  .vx-trial-card h2{margin:10px 0 0;color:#17211d;font-size:25px;line-height:1.15;letter-spacing:-.025em;font-weight:500}
  .vx-trial-list{display:grid;gap:10px;margin:20px 0 0;padding:0;list-style:none}
  .vx-trial-list li{position:relative;padding-left:20px;color:#68736f;font-size:14px;line-height:1.5}
  .vx-trial-list li:before{content:"";position:absolute;left:0;top:.58em;width:7px;height:7px;border-radius:50%;background:#0bcf74}
  .vx-trial-steps{display:grid;gap:14px;margin-top:20px}
  .vx-trial-step{display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:start}
  .vx-trial-step-number{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid #cce8d9;border-radius:50%;background:#f4fbf7;color:#176442;font-size:11px;font-weight:650}
  .vx-trial-step strong{display:block;color:#17211d;font-size:13.5px;font-weight:650}
  .vx-trial-step span{display:block;margin-top:4px;color:#68736f;font-size:13px;line-height:1.45}
  .vx-trial-disclosure{max-width:920px;margin:24px auto 0;padding-top:20px;border-top:1px solid #e3e9e5;color:#7a8580;text-align:center;font-size:12px;line-height:1.55}
  @media(max-width:760px){.vx-trial-page{padding:52px 0 72px}.vx-trial-grid{grid-template-columns:1fr;margin-top:38px}.vx-trial-card{padding:22px;border-radius:21px}.vx-trial-actions{flex-direction:column;align-items:stretch}.vx-trial-btn{width:100%}.vx-trial-hero h1{font-size:42px}}
</style>`;

function injectPricingStyles(html) {
  if (html.includes(`id="${PRICING_STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${pricingStyles}\n</head>`) : `${pricingStyles}${html}`;
}

function renderPricingFromLanding(html) {
  if (typeof html !== "string") return html;
  const content = `<section class="vx-trial-page"><div class="wrap">
    <div class="vx-trial-hero">
      <div class="vx-trial-kicker">Free Access</div>
      <h1>Watch Vixale before you decide.</h1>
      <p class="vx-trial-lead">Start with read-only viewer access. See active trade ideas, open trades, closed trades, and tracked results before deciding whether Vixale is right for you.</p>
      <div class="vx-trial-actions"><a class="vx-trial-btn primary" href="/access">Request Free Access</a><a class="vx-trial-btn" href="${SYSTEMS_PATH}">Explore Trading Systems</a></div>
      <p class="vx-trial-review">Submit the request, verify your email, and wait for manual review. If approved, we'll email your individual viewer code.</p>
    </div>
    <div class="vx-trial-grid">
      <article class="vx-trial-card"><div class="vx-trial-card-kicker">What you can see</div><h2>Follow the system before you make a decision.</h2><ul class="vx-trial-list"><li>Active trade ideas the system is watching.</li><li>Open trades currently being tracked.</li><li>Closed trades and recorded results.</li><li>A clear read-only view of the trading process.</li></ul></article>
      <article class="vx-trial-card"><div class="vx-trial-card-kicker">How it works</div><h2>Four simple steps.</h2><div class="vx-trial-steps"><div class="vx-trial-step"><div class="vx-trial-step-number">1</div><div><strong>Request access</strong><span>Send the short access form.</span></div></div><div class="vx-trial-step"><div class="vx-trial-step-number">2</div><div><strong>Verify your email</strong><span>Use the one-time link we send. Check Inbox and Spam/Junk if you do not see it.</span></div></div><div class="vx-trial-step"><div class="vx-trial-step-number">3</div><div><strong>Await manual review</strong><span>Verified requests are reviewed manually. Access is not automatic.</span></div></div><div class="vx-trial-step"><div class="vx-trial-step-number">4</div><div><strong>Receive your code</strong><span>If approved, we'll email your individual viewer code.</span></div></div></div></article>
    </div>
    <div class="vx-trial-disclosure">Viewer access is read-only and provided for transparency, tracking, education, and research. Trading involves risk and results are not guaranteed.</div>
  </div></section>`;
  let result = transformPrimaryNav(html);
  result = normalizeHeaderHashLinksToHome(result);
  result = replaceMainContents(result, content);
  result = injectPricingStyles(result);
  result = updateTitle(result, "Vixale | Watch System for Free");
  result = updateCanonical(result, PRICING_PATH);
  return result;
}

function injectRiskManagementNav(html) {
  if (typeof html !== "string" || html.includes(`class="${RISK_NAV_MARKER}"`)) return html;
  const navAnchor = '<div class="nav-links">';
  if (!html.includes(navAnchor)) return html;
  return html.replace(navAnchor, `${navAnchor}<a class="${RISK_NAV_MARKER}" href="${RISK_PATH}">Risk Management</a>`);
}

function installPublicIaRefinement(app) {
  app.use((req, res, next) => {
    const originalPath = req.path || req.url.split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead) return next();

    let mode = null;
    if (originalPath === HOME_PATH) mode = "home";
    else if (originalPath === SYSTEMS_PATH) mode = "systems";
    else if (originalPath === SERVICES_PATH) mode = "services";
    else if (originalPath === RESULTS_PATH) mode = "results";
    else if (originalPath === ACCESS_PATH) mode = "access";
    else if (originalPath === PRICING_PATH) mode = "pricing";
    if (!mode) return next();

    const originalSend = res.send.bind(res);
    res.send = function sendWithPublicIa(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) {
        if (mode === "home") body = refineHomeHtml(body);
        else if (mode === "systems") body = injectRiskManagementNav(body);
        else if (mode === "services") body = renderServicesFromLanding(body);
        else if (mode === "results") body = renderResultsFromLanding(body);
        else if (mode === "access") body = renderAccessFromLanding(body, req.query && req.query.system);
        else if (mode === "pricing") body = renderPricingFromLanding(body);
      }
      return originalSend(body);
    };

    if (mode === "services" || mode === "results" || mode === "access" || mode === "pricing") {
      const queryIndex = req.url.indexOf("?");
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      req.url = `/${query}`;
      if (Object.prototype.hasOwnProperty.call(req, "_parsedUrl")) delete req._parsedUrl;
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
  if (typeof expressFactory !== "function" || expressFactory.__vixalePublicIaWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installPublicIaRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixalePublicIaWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixalePublicIaModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  SYSTEMS_PATH,
  SERVICES_PATH,
  RESULTS_PATH,
  ACCESS_PATH,
  PRICING_PATH,
  RISK_PATH,
  SERVICE_SECTION_NEEDLES,
  SERVICES_INTRO_MARKER,
  SERVICES_OFFER_MARKER,
  SERVICES_OFFER_STYLE_ID,
  RESULTS_STYLE_ID,
  ACCESS_STYLE_ID,
  accessContext,
  findSectionById,
  replaceAccessFormSource,
  normalizeAccessLinksToAccessPage,
  renderAccessJourney,
  injectAccessStyles,
  renderAccessFromLanding,
  renderResultsHub,
  injectResultsStyles,
  renderResultsFromLanding,
  renderServicesOffer,
  injectServicesOfferStyles,
  refineHomeAccessCopy,
  normalizeAccessLinksToHome,
  renderServicesIntro,
  refineHomeHtml,
  renderServicesFromLanding,
  renderPricingFromLanding,
  injectRiskManagementNav,
  extractSectionByText,
  removeSectionsByText,
  replaceMainContents,
  installPublicIaRefinement,
  wrapExpress,
};