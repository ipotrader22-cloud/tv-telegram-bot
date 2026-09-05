"use strict";

const assert = require("assert");
const {
  GUIDE_BLOCK_HREF,
  GUIDE_NAV_TEXT,
  NFA_TEXT,
  refineNavigationAndDisclosure,
} = require("../website_navigation_disclosure_refinement");

const home = `<!doctype html><html><body>
<nav><div class="nav-links"><a href="/">Home</a><a href="/trading-systems">Trading Systems</a><a href="https://t.me/tradervip22">Telegram</a><a href="/services">Services</a><a href="/pricing">Watch System for Free</a><a href="/dashboard">Live Dashboard</a></div></nav>
<main><h1>Home</h1></main>
<footer><p><strong>Important disclosure:</strong> Trading involves risk.</p></footer>
</body></html>`;

const homeOut = refineNavigationAndDisclosure(home, "/");
assert(homeOut.includes(`<a href="${GUIDE_BLOCK_HREF}">${GUIDE_NAV_TEXT}</a>`));
assert(homeOut.indexOf(">Trading Systems</a>") < homeOut.indexOf(`>${GUIDE_NAV_TEXT}</a>`));
assert(homeOut.includes(`class="vx-nfa-disclosure">${NFA_TEXT}</span>`));
assert.strictEqual(refineNavigationAndDisclosure(homeOut, "/"), homeOut, "home refinement must be idempotent");

const systems = `<!doctype html><html><body>
<main><section class="vx-systems-page"><div class="wrap">
<section class="vx-systems-hero"><div class="vx-systems-actions"><a class="vx-systems-btn primary" href="/pricing">Watch System for Free</a><a class="vx-systems-btn" href="/dashboard">Live Dashboard</a></div></section>
<section class="vx-category-grid"><a class="vx-category-card">Day Trading</a></section>
<section class="vx-performance-strip"><div>Verify results before choosing a system.</div></section>
<div class="vx-detail-footer">Vixale presents system information for transparency, education, and research. Trading involves risk and results are not guaranteed.</div>
</div></section></main>
<footer><p><strong>Important disclosure:</strong> Vixale is not a broker.</p></footer>
</body></html>`;

const systemsOut = refineNavigationAndDisclosure(systems, "/trading-systems");
assert(!systemsOut.includes("vx-performance-strip"), "general Trading Systems page must not show Prime/Edge performance strip");
assert(systemsOut.includes(`<a class="vx-systems-btn" href="${GUIDE_BLOCK_HREF}">${GUIDE_NAV_TEXT}</a><a class="vx-systems-btn" href="/dashboard">Live Dashboard</a>`));
assert(systemsOut.includes(`<div class="vx-detail-footer">${NFA_TEXT} Vixale presents system information`));
assert(systemsOut.includes(`class="vx-nfa-disclosure">${NFA_TEXT}</span>`));
assert.strictEqual(refineNavigationAndDisclosure(systemsOut, "/trading-systems"), systemsOut, "systems refinement must be idempotent");

const day = refineNavigationAndDisclosure(systems, "/trading-systems/day-trading");
assert(day.includes("vx-performance-strip"), "Day Trading keeps the verified performance strip");
assert(!day.includes(`>${GUIDE_NAV_TEXT}</a>`), "category hero is not changed by general-page CTA refinement");
assert(day.includes(`<div class="vx-detail-footer">${NFA_TEXT} Vixale presents system information`));

const pricing = `<html><body><div class="vx-watch-risk">Performance figures are provided for transparency. Trading involves risk.</div><div class="vx-trial-disclosure">Dashboard access is read-only. Trading involves risk.</div></body></html>`;
const pricingOut = refineNavigationAndDisclosure(pricing, "/pricing");
assert(pricingOut.includes(`<div class="vx-watch-risk">${NFA_TEXT} Performance figures`));
assert(pricingOut.includes(`<div class="vx-trial-disclosure">${NFA_TEXT} Dashboard access`));
assert.strictEqual(refineNavigationAndDisclosure(pricingOut, "/pricing"), pricingOut, "disclaimer refinement must be idempotent");

console.log("Navigation + guide CTA + NFA disclaimer refinement: PASS");
