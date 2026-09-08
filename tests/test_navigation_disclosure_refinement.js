"use strict";

const assert = require("assert");
const {
  GUIDE_BLOCK_HREF,
  GUIDE_NAV_TEXT,
  NFA_TEXT,
  STYLE_ID,
  PUBLIC_NAV_PATHS,
  normalizePublicNavigation,
  moveGuideBeforeDisclosure,
  refineNavigationAndDisclosure,
} = require("../website_navigation_disclosure_refinement");

const expectedNav = [
  'href="/trading-systems">Trading Systems</a>',
  'href="/#live-day-trading">Performance</a>',
  'href="/services">Services</a>',
  'href="/about">About</a>',
  'href="/trading-guide">Trading Guide</a>',
  'class="vx-public-nav-login" href="/dashboard">Login</a>',
  'class="vx-public-nav-cta" href="/#password-access">Request Free Access</a>',
];

const home = `<!doctype html><html><head></head><body>
<nav><div class="nav-links"><a href="/">Home</a><a href="/trading-systems">Trading Systems</a><a href="https://t.me/tradervip22">Telegram</a><a href="/services">Services</a><a href="/pricing">Watch System for Free</a><a href="/dashboard">Live Dashboard</a></div></nav>
<main><h1>Home</h1><svg class="vx-home-equity-svg"><text fill="#87918d" font-size="9">$0</text></svg></main>
<footer><p><strong>Important disclosure:</strong> Trading involves risk.</p></footer>
</body></html>`;

const homeOut = refineNavigationAndDisclosure(home, "/");
for (const fragment of expectedNav) assert(homeOut.includes(fragment), `missing unified nav fragment: ${fragment}`);
assert(homeOut.includes(`class="vx-nfa-disclosure">${NFA_TEXT}</span>`));
assert(homeOut.includes(`id="${STYLE_ID}"`));
assert(homeOut.includes(".vx-home-equity-svg text{fill:#5f6d67!important;font-size:11px!important}"));
assert(homeOut.includes("a:focus-visible,button:focus-visible"));
assert.strictEqual(refineNavigationAndDisclosure(homeOut, "/"), homeOut, "home refinement must be idempotent");

const guideNav = '<html><head></head><body><header><div class="nav"><a class="brand" href="/">VIXALE</a><div class="navlinks"><a href="/trading-systems">Trading Systems</a><a class="vx-guide-btn" href="/download/trading-guide.pdf">Download PDF</a></div></div></header></body></html>';
const guideOut = refineNavigationAndDisclosure(guideNav, "/trading-guide");
assert(guideOut.includes('<a class="brand" href="/">VIXALE</a>'), "brand must be preserved");
for (const fragment of expectedNav) assert(guideOut.includes(fragment), `guide nav missing: ${fragment}`);
assert(!guideOut.includes(">Download PDF</a>"), "top navigation uses the shared contract; PDF remains available in page content");

const systems = `<!doctype html><html><head></head><body>
<nav><div class="nav-links"><a href="/">Home</a></div></nav>
<main><section class="vx-systems-page"><div class="wrap">
<section class="vx-systems-hero"><div class="vx-systems-actions"><a class="vx-systems-btn primary" href="/#password-access">Request Free Access</a><a class="vx-systems-btn" href="/dashboard">Live Dashboard</a></div></section>
<section class="vx-category-grid"><a class="vx-category-card">Day Trading</a></section>
<section class="vx-performance-strip"><div>Verify results before choosing a system.</div></section>
<div class="vx-detail-footer">Vixale presents system information for transparency, education, and research. Trading involves risk and results are not guaranteed.</div>
</div></section></main>
<section class="vx-guide-shell vx-guide-compact" aria-labelledby="vx-how-to-trade-title"><h2 id="vx-how-to-trade-title">How to Trade Vixale</h2></section>
<footer><p><strong>Important disclosure:</strong> Vixale is not a broker.</p></footer>
</body></html>`;

const systemsOut = refineNavigationAndDisclosure(systems, "/trading-systems");
assert(!systemsOut.includes("vx-performance-strip"), "general Trading Systems page must not show the old duplicate performance strip");
assert(systemsOut.includes(`<a class="vx-systems-btn" href="${GUIDE_BLOCK_HREF}">${GUIDE_NAV_TEXT}</a><a class="vx-systems-btn" href="/dashboard">Live Dashboard</a>`));
assert(systemsOut.indexOf('class="vx-guide-shell vx-guide-compact"') < systemsOut.indexOf('class="vx-detail-footer"'), "beginner guide must be before the system disclosure");
assert(systemsOut.includes(`<div class="vx-detail-footer">${NFA_TEXT} Vixale presents system information`));
assert(systemsOut.includes(`class="vx-nfa-disclosure">${NFA_TEXT}</span>`));
for (const fragment of expectedNav) assert(systemsOut.includes(fragment));
assert.strictEqual(refineNavigationAndDisclosure(systemsOut, "/trading-systems"), systemsOut, "systems refinement must be idempotent");

const alreadyOrdered = '<main><section class="vx-guide-shell vx-guide-compact">Guide</section><div class="vx-detail-footer">Risk</div></main>';
assert.strictEqual(moveGuideBeforeDisclosure(alreadyOrdered), alreadyOrdered, "already-correct guide ordering must remain unchanged");

const pricing = `<html><head></head><body><div class="nav-links"><a href="/">Home</a></div><div class="vx-watch-risk">Performance figures are provided for transparency. Trading involves risk.</div><div class="vx-trial-disclosure">Dashboard access is read-only. Trading involves risk.</div></body></html>`;
const pricingOut = refineNavigationAndDisclosure(pricing, "/pricing");
assert(pricingOut.includes(`<div class="vx-watch-risk">${NFA_TEXT} Performance figures`));
assert(pricingOut.includes(`<div class="vx-trial-disclosure">${NFA_TEXT} Dashboard access`));
assert(pricingOut.includes(`id="${STYLE_ID}"`));

assert(PUBLIC_NAV_PATHS.has("/about"));
assert(PUBLIC_NAV_PATHS.has("/services"));
assert(PUBLIC_NAV_PATHS.has("/trading-guide"));
assert.strictEqual(normalizePublicNavigation("<html><body>No nav links container</body></html>"), "<html><body>No nav links container</body></html>");

console.log("Unified public navigation + guide ordering + accessibility: PASS");
