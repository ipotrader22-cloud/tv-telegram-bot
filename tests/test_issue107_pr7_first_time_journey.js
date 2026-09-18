"use strict";

const assert = require("assert");
const nav = require("../website_navigation_disclosure_refinement");
const systems = require("../website_trading_systems_product_refinement");
const publicIa = require("../website_public_ia_refinement");

const navHtml = nav.renderPublicNavLinks("/");
for (const item of [
  ['href="/trading-systems#vx-how-to-trade-title"', "How It Works"],
  ['href="/trading-systems"', "Trading Systems"],
  ['href="/results"', "Results"],
  ['href="/services"', "Services"],
  ['href="/trading-guide"', "Help"],
  ['href="/dashboard"', "Log In"],
  ['href="/access"', "Request Free Access"],
]) {
  assert(navHtml.includes(item[0]) && navHtml.includes(`>${item[1]}</a>`), `shared navigation missing ${item[1]}`);
}

const systemsHub = systems.renderHubPage();
assert(systemsHub.includes("Choose the trading category that fits how you want to follow the market."));
for (const path of [systems.DAY_PATH, systems.SWING_PATH, systems.OPTIONS_PATH]) assert(systemsHub.includes(`href="${path}"`), `systems hub missing ${path}`);
for (const phrase of ["Holding horizon", "How often to check", "Public now", "Viewer access"]) assert(systemsHub.includes(phrase), `systems comparison missing ${phrase}`);
for (const internal of ["Vixale Prime", "Vixale Edge", "Vixale Swing System", "Swing Leaders", "Options Straddles"]) assert(!systemsHub.includes(internal), `category comparison introduces ${internal} too early`);

const results = publicIa.renderResultsHub();
assert(results.includes('id="day-trading"') && results.includes('href="/#live-day-trading"'));
assert(results.includes('id="swing-trading"') && results.includes('href="/trading-systems/swing-trading"'));
assert(results.includes('id="options"') && results.includes('href="/trading-systems/options"'));
assert(results.includes("Research/model portfolio only — not broker execution or brokerage-account performance."));
assert(results.includes("Options evidence stays separate from Day Trading performance."));

const accessForm = `<section id="password-access"><form method="POST" action="/password-request"><input type="hidden" name="source" value="Website"><input name="name" required><input name="email" type="email" required><button type="submit">Request Free Access</button></form></section>`;
const access = publicIa.renderAccessJourney(accessForm, publicIa.accessContext("day-trading"));
for (const phrase of [
  "Request read-only Vixale viewer access",
  "Verify email",
  "Manual review",
  "viewer code",
  "read-only",
  "60 minutes",
  "Approval is not automatic",
]) assert(access.toLowerCase().includes(phrase.toLowerCase()), `access journey missing ${phrase}`);
assert(access.includes("Day Trading"));

const services = publicIa.renderServicesOffer();
for (const title of ["Signals &amp; Research", "Automation / Setup", "Strategy Review / Development", "Custom Bot / Integration"]) assert(services.includes(`<h3>${title}</h3>`), `services missing ${title}`);
assert.strictEqual((services.match(/class="vx-services-offer-card"/g) || []).length, 4, "Services must keep exactly four commercial cards");
assert(services.includes('href="/access"'), "free viewer access must remain a separate path");
assert(services.includes("does not trade or manage customer brokerage accounts"), "Services must keep account-management boundary");

const day = systems.renderDayPage();
assert(day.includes("Vixale Prime") && day.includes("Vixale Edge"));
assert(day.includes("An approved Edge position can remain open overnight when its rules require it"));
assert(day.includes('href="/results#day-trading"'));
assert(day.includes('href="/access?system=day-trading"') || day.includes('href="/#password-access"'), "Day page must preserve an access next step");

const options = systems.renderOptionsPage();
assert(options.includes("owner-entered Option Journal"));
assert(options.includes('href="/results#options"'));
assert(options.includes('href="/trading-systems/options/viewer"'));
assert(!options.includes('href="/#live-day-trading"'), "Options must never route to Day Trading evidence");

console.log("Issue #107 PR7 first-time visitor journey: PASS");
