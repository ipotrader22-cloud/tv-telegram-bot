"use strict";

const assert = require("assert");
const {
  SERVICE_SECTION_NEEDLES,
  refineHomeHtml,
  renderServicesFromLanding,
  renderPricingFromLanding,
  injectRiskManagementNav,
} = require("../website_public_ia_refinement");

const sample = `<!doctype html><html><head><title>Vixale | Watch a Live Trading System</title><link rel="canonical" href="https://www.vixale.com/"><style>.wrap{max-width:1180px}</style></head><body>
<nav><div class="nav-links"><a href="#live">Live System</a><a href="/trading-systems">Trading Systems</a><a href="/risk-management">Risk Management</a><a href="#start">Start Here</a><a href="#why">Why It Makes Sense</a><a href="#creators">Creators</a></div></nav>
<main>
<section id="hero"><h1>Watch live</h1></section>
<section id="help"><h2>What can we help you with?</h2><div>01 / Watch</div><a href="#setup-call">Book Setup Call</a><a href="#bot-builder">Start Bot Builder Chat</a><a href="#strategy-rules">Test My Strategy</a></section>
<section id="setup-call"><h2>Book a quick setup call.</h2><form id="setup-form"></form></section>
<section id="bot-builder"><h2>Describe the trading bot you want.</h2><form id="bot-form"></form></section>
<section id="strategy-rules"><h2>Send us your trading rules.</h2><form id="strategy-form"></form></section>
<section id="steps"><h2>Simple steps. Clear choices.</h2></section>
<section id="creators"><h2>Have an audience? Launch a trading product with Vixale.</h2></section>
</main><footer>risk disclosure</footer></body></html>`;

const home = refineHomeHtml(sample);
assert(!home.includes(">Risk Management</a>"));
assert(home.includes('href="/services">Services</a>'));
assert(home.includes('href="/pricing">7 Days Free</a>'));
for (const needle of SERVICE_SECTION_NEEDLES) assert(!home.includes(needle));
assert(home.includes("Simple steps. Clear choices."));
assert(home.includes("Have an audience? Launch a trading product with Vixale."));

const services = renderServicesFromLanding(sample);
assert(services.includes("<title>Vixale | Services</title>"));
for (const needle of SERVICE_SECTION_NEEDLES) assert(services.includes(needle));
assert(services.includes('id="setup-form"'));
assert(services.includes('href="/#live"'));
assert(services.includes('href="#setup-call"'));
assert(!services.includes("Simple steps. Clear choices."));
assert(!services.includes("Have an audience? Launch a trading product with Vixale."));
assert(services.includes("https://www.vixale.com/services"));

const pricing = renderPricingFromLanding(sample);
assert(pricing.includes("<title>Vixale | 7 Days Free</title>"));
assert(pricing.includes("Watch Vixale free for 7 days."));
assert(pricing.includes('href="/#access">Request 7-Day Access</a>'));
assert(pricing.includes('href="/trading-systems">Explore Trading Systems</a>'));
assert(pricing.includes("Access requests are reviewed manually."));
assert(pricing.includes("Active trade ideas the system is watching."));
assert(pricing.includes("Watch for 7 days"));
assert(!pricing.includes("Coming Soon"));
assert(!pricing.includes("What can we help you with?"));
assert(pricing.includes("https://www.vixale.com/pricing"));

const systems = '<html><body><nav><div class="nav-links"><a href="/">Home</a></div></nav></body></html>';
const systemsOut = injectRiskManagementNav(systems);
assert(systemsOut.includes('class="vx-risk-management-nav-link"'));
assert(systemsOut.includes('href="/risk-management">Risk Management</a>'));
assert.strictEqual(injectRiskManagementNav(systemsOut), systemsOut, "Risk Management nav injection must be idempotent");

console.log("Public IA refinement contract: PASS");
