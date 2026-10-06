"use strict";

const assert = require("assert");
const nav = require("../website_conversion_navigation_refinement");
const alignment = require("../website_public_navigation_alignment");
const { localizeRussianHtml } = require("../website_russian_localization");

const base = `<!doctype html><html lang="en"><head><title>Vixale</title></head><body><nav><a class="brand" href="/">VIXALE</a><div class="nav-links"><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="/services">Services</a><a href="/trading-guide">Help</a><a href="/dashboard">Log In</a><a href="/access">Request Free Access</a></div></nav><main>content</main><footer><nav class="vx-public-secondary-nav"><a href="/about">About</a></nav></footer></body></html>`;

const day = nav.refineConversionNavigation(base, nav.DAY_PATH);
for (const [href, label] of [
  [nav.HOW_IT_WORKS_HREF, "How It Works"],
  [nav.TRADING_SYSTEMS_PATH, "Trading Systems"],
  [nav.DAY_PATH, "Day Trading"],
  [nav.SWING_PATH, "Swing Trading"],
  [nav.OPTIONS_PATH, "Options"],
  [nav.RESULTS_PATH, "Results"],
  [nav.DAILY_SUMMARY_PATH, "Daily Recaps"],
  [nav.PRICING_PATH, "Pricing"],
  [nav.SERVICES_PATH, "Services"],
  [nav.HELP_PATH, "Help"],
]) {
  assert(day.includes(`href="${href}"`), `missing ${href}`);
  assert(day.includes(`>${label}</a>`), `missing ${label}`);
}
assert(day.includes(`href="${nav.DAY_PATH}" aria-current="page">Day Trading</a>`));
assert(day.includes('class="vx-public-nav-login" href="/dashboard">Log In</a>'));
assert(day.includes(`class="vx-public-nav-cta" href="${nav.LIVE_ACCESS_HREF}">Live Access</a>`));
assert.strictEqual(nav.LIVE_ACCESS_HREF, "/#password-access", "Live Access must route to the existing email-registration block");
assert(!day.includes('>Get 30 Days Free</a>'), "Telegram trial CTA must no longer occupy the global menu");
assert(!day.includes('>Request Free Access</a>'), "legacy viewer-access label must no longer occupy the global menu");
assert(nav.DAY_TRIAL_TEXT.includes("30-day free Day Trading Telegram signals trial"));
assert(!nav.DAY_TRIAL_TEXT.toLowerCase().includes("futures"));
assert(day.includes("font-size:14px!important;font-weight:500!important"), "menu typography must use the quieter Pic.2-style treatment");
assert(day.includes("flex-wrap:nowrap;overflow-x:auto"), "mobile navigation must keep every merged menu link reachable");
assert.strictEqual(nav.refineConversionNavigation(day, nav.DAY_PATH), day, "refinement must be idempotent");
assert.strictEqual(nav.refineConversionNavigation(base, "/dashboard"), base, "protected route must not be rewritten");

const alignedDay = alignment.injectAlignmentStyles(day);
assert(alignedDay.includes(`id="${alignment.STYLE_ID}"`), "public pages with unified navigation must receive the alignment stylesheet");
assert(alignedDay.includes("grid-template-columns:minmax(0,1fr) auto!important"), "desktop header must keep primary links and actions on the same row");
assert(alignedDay.includes("flex-wrap:nowrap!important"), "desktop public navigation must explicitly prevent wrapping");
assert(alignedDay.includes("@media(min-width:1001px) and (max-width:1180px)"), "tight desktop widths must receive compact spacing instead of a second row");
assert.strictEqual(alignment.injectAlignmentStyles(alignedDay), alignedDay, "alignment refinement must be idempotent");
assert.strictEqual(alignment.injectAlignmentStyles(base), base, "alignment stylesheet must not be injected before unified navigation exists");

const swing = nav.refineConversionNavigation(base, nav.SWING_PATH);
assert(swing.includes(`href="${nav.SWING_PATH}" aria-current="page">Swing Trading</a>`));
const options = nav.refineConversionNavigation(base, nav.OPTIONS_PATH);
assert(options.includes(`href="${nav.OPTIONS_PATH}" aria-current="page">Options</a>`));
const results = nav.refineConversionNavigation(base, nav.RESULTS_PATH);
assert(results.includes(`href="${nav.RESULTS_PATH}" aria-current="page">Results</a>`));
const pricing = nav.refineConversionNavigation(base, nav.PRICING_PATH);
assert(pricing.includes(`href="${nav.PRICING_PATH}" aria-current="page">Pricing</a>`));
const about = nav.refineConversionNavigation(base, nav.ABOUT_PATH);
assert(!about.includes(`href="${nav.ABOUT_PATH}" aria-current="page">About</a>`), "About must no longer occupy the primary navigation");
assert(about.includes('<nav class="vx-public-secondary-nav"') && about.includes('href="/about">About</a>'), "About must remain available in secondary navigation");
const recaps = nav.refineConversionNavigation(base, nav.DAILY_SUMMARY_PATH);
assert(recaps.includes(`href="${nav.DAILY_SUMMARY_PATH}" aria-current="page">Daily Recaps</a>`));
const datedRecap = nav.refineConversionNavigation(base, `${nav.DAILY_SUMMARY_PATH}/2026-10-05`);
assert(datedRecap.includes(`href="${nav.DAILY_SUMMARY_PATH}" aria-current="page">Daily Recaps</a>`), "dated recap pages must keep Daily Recaps active");
assert(nav.isPublicPath(`${nav.DAILY_SUMMARY_PATH}/2026-10-05`), "dated recap pages must receive the unified public navigation");
const services = nav.refineConversionNavigation(base, nav.SERVICES_PATH);
assert(services.includes(`href="${nav.SERVICES_PATH}" aria-current="page">Services</a>`));
const help = nav.refineConversionNavigation(base, nav.HELP_PATH);
assert(help.includes(`href="${nav.HELP_PATH}" aria-current="page">Help</a>`));

const standaloneSwing = `<!doctype html><html lang="en"><head><title>Swing</title></head><body><nav class="swing-nav"><a class="brand" href="/">VIXALE</a><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="/dashboard">Log In</a><a href="/access">Request Free Access</a></nav><main>portfolio</main><footer>footer</footer></body></html>`;
const standaloneRefined = nav.refineConversionNavigation(standaloneSwing, nav.SWING_PATH);
assert(standaloneRefined.includes('class="nav-links"'), "standalone Swing nav must receive the standard navigation container");
assert(standaloneRefined.includes('class="vx-unified-public-nav"'), "standalone Swing nav must receive merged public navigation");
assert(standaloneRefined.includes(`href="${nav.SWING_PATH}" aria-current="page">Swing Trading</a>`));
assert(standaloneRefined.includes(`class="vx-public-nav-cta" href="${nav.LIVE_ACCESS_HREF}">Live Access</a>`));
assert(!standaloneRefined.includes('>Request Free Access</a>'));
assert.strictEqual(nav.refineConversionNavigation(standaloneRefined, nav.SWING_PATH), standaloneRefined, "standalone refinement must be idempotent");
const standaloneAligned = alignment.injectAlignmentStyles(standaloneRefined);
assert(standaloneAligned.includes(`id="${alignment.STYLE_ID}"`), "standalone strategy pages must receive the same desktop alignment stylesheet");

const ru = localizeRussianHtml(day, nav.DAY_PATH);
for (const label of ["Как это работает", "Торговые системы", "Дейтрейдинг", "Свинг-трейдинг", "Опционы", "Результаты", "Ежедневные итоги", "Тарифы", "Услуги", "Помощь", "Войти", "Live-доступ"]) {
  assert(ru.includes(`>${label}</a>`), `missing RU navigation label ${label}`);
}
assert(ru.includes(`href="${nav.LIVE_ACCESS_HREF}">Live-доступ</a>`));

console.log("Unified public navigation + Live Access: PASS");
