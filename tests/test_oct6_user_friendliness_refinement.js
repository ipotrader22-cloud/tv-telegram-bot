"use strict";

const assert = require("assert");
const ux = require("../website_oct6_user_friendliness_refinement");
const offer = require("../lib/website-commercial-offer");
const home = require("../website_conversion_home_refinement");
const sales = require("../website_options_sales_page_refinement");
const publicOptions = require("../website_options_public_evidence_refinement");
const results = require("../website_conversion_results_refinement");

const shell = body => `<!doctype html><html lang="en"><head><title>Vixale</title></head><body><nav><a class="brand" href="/">VIXALE</a><div class="nav-links"><div class="vx-unified-public-nav"><a href="/trading-systems">Trading Systems</a><a href="/results">Results</a><a href="/pricing">Pricing</a></div><div class="vx-direct-nav-actions"><a class="vx-public-nav-login" href="/dashboard">Log In</a><a class="vx-public-nav-cta" href="/#password-access">Live Access</a></div></div></nav><main>${body}</main><footer><nav class="vx-public-secondary-nav"><a href="/about">About</a><a href="/services">Services</a><a href="/trading-guide">Help</a></nav></footer></body></html>`;

const nav = ux.refineHtml(shell("content"), "/trading-systems/day-trading", "en");
const navOrder = [
  'href="/trading-systems/day-trading"',
  'href="/trading-systems/swing-trading"',
  'href="/trading-systems/options"',
  'href="/results"',
  'href="/pricing"',
];
let previous = -1;
for (const token of navOrder) {
  const index = nav.indexOf(token);
  assert(index > previous, `navigation order missing or wrong: ${token}`);
  previous = index;
}
assert(nav.includes('href="/trading-systems/day-trading" class="is-active" aria-current="page">Day Trading</a>'));
assert(nav.includes('class="vx-public-nav-login" href="/dashboard">Log In</a>'));
assert(nav.includes('>Get 30 Days Free</a>'));
assert(!nav.includes('>Live Access</a>'));
for (const secondary of ["How It Works", "Trading Systems", "Daily Recaps", "Services", "About", "Help"]) {
  assert(nav.includes(`>${secondary}</a>`), `missing secondary nav: ${secondary}`);
}
assert(nav.includes("#password-access{scroll-margin-top:140px!important}"));

const homeHtml = shell(home.renderHeroAndPreview());
const refinedHome = ux.refineHtml(homeHtml, "/", "en");
assert(refinedHome.includes("Trading signals. Three systems. Your choice."));
assert(refinedHome.includes("Vixale publishes trading signals and portfolio updates. Follow Day Trading signals in Telegram, review Swing and Options updates on the website, and place any trades through your own broker."));
assert(refinedHome.includes(">Get 30 Days Free</a>"));
assert(refinedHome.includes(">View Trading Results</a>"));
assert(refinedHome.includes(">Request Free Viewer Access</a>"));
assert(refinedHome.includes("30 days of Day Trading signals through Telegram. Request your trial on Telegram; we’ll confirm activation."));
assert(!refinedHome.includes(">Telegram Signals</a>"));
assert(!refinedHome.includes('class="vx-conversion-btn recaps"'));
assert(refinedHome.includes(">Explore Day Trading</a>"));
assert(refinedHome.includes(">View Swing Portfolio</a>"));
assert(refinedHome.includes(">Explore Options</a>"));
assert(!refinedHome.includes("actively managed options 0DTE system"));
assert(refinedHome.includes("Options chart and trade journal are public."));
assert(refinedHome.includes('href="/access?system=options">Request Free Viewer Access</a>'));
for (const key of ["day", "swing", "options"]) {
  assert(refinedHome.includes(`data-vx-preview-tab="${key}"`), `preview tab lost: ${key}`);
}

const salesMain = sales.renderOptionsSalesMain({ available: false }, "en");
const salesHtml = shell(salesMain);
const misrouted = publicOptions.refinePublicOptionsPage(salesHtml, { trades: [], equity_curve: [] }, "en", true);
assert(misrouted.includes('/#password-access') || misrouted.includes('/access'), "fixture should exercise the previous viewer rewrite");
const fixedOptions = ux.refineHtml(misrouted, "/trading-systems/options", "en");
const paidUrl = offer.systemOffer("options").subscription_request_url;
assert(fixedOptions.includes(`href="${paidUrl}"`), "paid Options CTA must use paid Telegram plan request");
assert(fixedOptions.includes(">Request Options Subscription — $49/month</a>"));
assert(fixedOptions.includes('href="/access?system=options">Request Free Viewer Access</a>'));
assert(fixedOptions.includes("Options service: published positions and website updates"));
assert(fixedOptions.includes("Brokerage proof files remain governed by the existing viewer-access permissions"));
assert(!fixedOptions.includes("Start with Vixale viewer access:"));
assert(!fixedOptions.includes('class="vx-options-benefit-card" href='), "benefit cards must not masquerade as viewer-request actions");

const pricing = ux.refineHtml(shell("old pricing"), "/pricing", "en", { system: "options" });
assert(pricing.includes("<h2 id=\"vx-price-process-title\">How to join</h2>"));
assert(pricing.includes("Choose your plan and send us the prepared Telegram message. We’ll reply with payment and access instructions."));
assert(pricing.includes(">Request $49/month →</span>"));
assert(pricing.includes(">Request the Bundle — $99/month</a>"));
assert(pricing.includes(">Request Free Viewer Access</a>"));
for (const forbidden of ["fake checkout", "unsupported delivery", "in this release", "existing destination", "legacy links remain supported"]) {
  assert(!pricing.toLowerCase().includes(forbidden), `pricing leaked implementation commentary: ${forbidden}`);
}

const resultsHtml = shell(results.renderResultsMain());
const fixedResults = ux.refineHtml(resultsHtml, "/results", "en");
assert(fixedResults.includes("Recorded Options Results"));
assert(fixedResults.includes("The Options performance chart and Option Journal are public; brokerage proof files remain protected under existing viewer permissions."));
assert(fixedResults.includes(">Get 30 Days Free</a>"));
assert(fixedResults.includes(">Request Swing Subscription — $49/month</a>"));
assert(fixedResults.includes(">Request Options Subscription — $49/month</a>"));

const accessFixture = shell('<section class="vx-access-page"><article class="vx-access-fact"><strong>What access opens</strong><p>Approved viewer access opens the read-only Day Trading dashboard and the protected Options viewer. The Swing research/model portfolio is already public and does not require login.</p></article><div class="vx-access-foot">Existing approved viewer? <a href="/login">Log In with your viewer code</a>. Legacy links to <code>/#password-access</code> remain supported.</div></section>');
const fixedAccess = ux.refineHtml(accessFixture, "/access", "en");
assert(fixedAccess.includes("The public Options chart and Option Journal and the public Swing model portfolio do not require login."));
assert(!fixedAccess.includes("Legacy links to"));

const guideFixture = shell('<section class="section" id="options"><div>Options · Protected workflow</div><p>Options remains a website-update product in this release.</p></section>');
const fixedGuide = ux.refineHtml(guideFixture, "/trading-guide", "en");
assert(fixedGuide.includes("Options · Published workflow"));
assert(fixedGuide.includes("Follow a published position from entry to recorded result."));
assert(fixedGuide.includes("public performance chart and Option Journal"));
assert(fixedGuide.includes(">Request Options Subscription — $49/month</a>"));
assert(fixedGuide.includes(">Request Free Viewer Access</a>"));
assert(!fixedGuide.includes("ES straddle"));
assert(!fixedGuide.includes("6:00–8:30"));

const ruNav = ux.refineHtml(shell("content"), "/pricing", "ru");
for (const label of ["Дейтрейдинг", "Свинг-трейдинг", "Опционы", "Результаты", "Тарифы", "Войти", "30 дней бесплатно"]) {
  assert(ruNav.includes(`>${label}</a>`), `missing RU audit nav label: ${label}`);
}
const ruHome = ux.refineHtml(homeHtml, "/", "ru");
assert(ruHome.includes("Vixale публикует торговые сигналы и обновления портфеля."));
assert(ruHome.includes("Запросить бесплатный viewer-доступ"));

assert(refinedHome.includes('data-vx-funnel-kind="trial"'));
assert(refinedHome.includes('data-vx-funnel-system="day-trading"'));
assert(pricing.includes('data-vx-funnel-kind="pricing_plan"'));
assert(pricing.includes('id="vx-oct6-user-friendliness-funnel"'));
assert.strictEqual(ux.refineHtml(refinedHome, "/", "en"), refinedHome, "audit refinement must be idempotent on homepage");

console.log("October 6 user-friendliness and conversion audit: PASS");
