"use strict";

const assert = require("assert");
const {
  OPTIONS_VIEWER_URL,
  SWING_PORTFOLIO_URL,
  addQuickMenuSystemLinks,
} = require("../lib/website-quick-menu");
const { refineNavigationAndDisclosure } = require("../website_navigation_disclosure_refinement");
const russianTranslations7 = require("../website_russian_translations_7");

const quickMenu = `<!doctype html><html><body><div class="quick-nav">
<a class="pill" href="/">← Back to Home</a>
<a class="pill" href="/trading-systems">Trading Systems</a>
<a class="pill" href="/risk-management">Risk Management</a>
</div></body></html>`;

const out = addQuickMenuSystemLinks(quickMenu);
assert(out.includes(`<a class="pill" href="${OPTIONS_VIEWER_URL}" data-vx-quick-nav-item="options">Options</a>`));
assert(out.includes(`<a class="pill" href="${SWING_PORTFOLIO_URL}" data-vx-quick-nav-item="swing-portfolio">Swing Portfolio</a>`));
assert(out.indexOf(">Risk Management</a>") < out.indexOf(">Options</a>"));
assert(out.indexOf(">Options</a>") < out.indexOf(">Swing Portfolio</a>"));
assert.strictEqual(addQuickMenuSystemLinks(out), out, "quick-menu refinement must be idempotent");

const wired = refineNavigationAndDisclosure(quickMenu, "/legacy-quick-menu");
assert(wired.includes(`href="${OPTIONS_VIEWER_URL}"`), "global navigation refinement must add Options on quick-menu routes");
assert(wired.includes(`href="${SWING_PORTFOLIO_URL}"`), "global navigation refinement must add Swing Portfolio on quick-menu routes");

const ruMap = new Map(russianTranslations7);
assert.strictEqual(ruMap.get("Swing Portfolio"), "Свинг-портфель", "Russian quick-menu label must be translated");

const unrelated = '<nav><a href="/">Home</a><a href="/trading-systems">Trading Systems</a><a href="/risk-management">Risk Management</a></nav>';
assert.strictEqual(addQuickMenuSystemLinks(unrelated), unrelated, "unrelated navigation must remain unchanged");

console.log("Public quick-menu EN/RU Options + Swing Portfolio links: PASS");
