"use strict";

const assert = require("assert");
const {
  SERVICE_SECTION_NEEDLES,
  SERVICES_INTRO_MARKER,
  SERVICES_OFFER_MARKER,
  refineHomeAccessCopy,
  normalizeAccessLinksToHome,
  refineHomeHtml,
  renderServicesFromLanding,
  renderPricingFromLanding,
  injectRiskManagementNav,
} = require("../website_public_ia_refinement");

const sample = `<!doctype html><html><head><title>Vixale | Watch a Live Trading System</title><link rel="canonical" href="https://www.vixale.com/"><style>.wrap{max-width:1180px}</style></head><body>
<nav><div class="nav-links"><a href="#live">Live System</a><a href="/trading-systems">Trading Systems</a><a href="/risk-management">Risk Management</a><a href="#start">Start Here</a><a href="#why">Why It Makes Sense</a><a href="#creators">Creators</a></div></nav>
<main>
<section id="hero"><h1>Watch live</h1><a href="#password-access">Request 7-Day Access</a><p>Read-only dashboard · Manual approval · Individual access code</p></section>
<section id="password-access"><div>Private dashboard access</div><h2>Request access to the live dashboard.</h2><p>Send a short access request. Every request is reviewed manually before an individual dashboard code is created.</p><p>Once approved, you will receive a reply by email with the login instructions.</p><div>Reviewed. Access is never granted automatically.</div><div>Direct. The approval response goes to your email.</div><div>Private. Every approved viewer receives an individual access code.</div><button>Request Dashboard Access</button><small>Your request is reviewed manually. Trading involves risk and results are not guaranteed.</small></section>
<section id="help"><h2>What can we help you with?</h2><div>01 / Watch</div><a href="#password-access">Request Dashboard Access</a><a href="#setup-call">Book Setup Call</a><a href="#bot-builder">Start Bot Builder Chat</a><a href="#strategy-rules">Test My Strategy</a></section>
<section id="setup-call"><h2>Book a quick setup call.</h2><form id="setup-form"></form></section>
<section id="bot-builder"><h2>Describe the trading bot you want.</h2><form id="bot-form"></form></section>
<section id="strategy-rules"><h2>Send us your trading rules.</h2><form id="strategy-form"></form></section>
<section id="steps"><h2>Simple steps. Clear choices.</h2></section>
<section id="creators"><h2>Have an audience? Launch a trading product with Vixale.</h2></section>
</main><footer>risk disclosure</footer></body></html>`;

const home = refineHomeHtml(sample);
assert(!home.includes(">Risk Management</a>"));
assert(home.includes('href="/services">Services</a>'));
assert(home.includes('href="/pricing">Watch System for Free</a>'));
for (const needle of SERVICE_SECTION_NEEDLES) assert(!home.includes(needle));
assert(home.includes("Simple steps. Clear choices."));
assert(home.includes("Have an audience? Launch a trading product with Vixale."));
assert(home.includes("Request Free Access"));
assert(home.includes("Request free access to Vixale."));
assert(home.includes("verify your email, and wait for manual review"));
assert(home.includes("Inbox and Spam/Junk"));
assert(home.includes("Read-only access · Email verification · Manual review"));
assert(home.includes("Email verification is required. Access is not granted automatically."));
assert(!home.includes("Request 7-Day Access"));

const directHomeCopy = refineHomeAccessCopy("Request 7-Day Access · Request Dashboard Access");
assert.strictEqual(directHomeCopy, "Request Free Access · Request Free Access");
assert.strictEqual(normalizeAccessLinksToHome('<a href="#password-access">x</a><a href="/services#password-access">y</a>'), '<a href="/#password-access">x</a><a href="/#password-access">y</a>');

const services = renderServicesFromLanding(sample);
assert(services.includes("<title>Vixale | Services</title>"));
assert(services.includes(`class="wrap section ${SERVICES_INTRO_MARKER}"`));
assert(services.includes('<h1 id="vx-services-title">Vixale Services</h1>'));
assert(services.includes(`class="${SERVICES_OFFER_MARKER}"`));
for (const heading of ["Viewer Access", "Signals &amp; Research Access", "Automation Setup", "Custom Development"]) assert(services.includes(heading));
assert(services.includes('href="/#password-access">Request Free Access →</a>'));
assert(services.includes('href="#setup-call">Discuss research access →</a>'));
assert(services.includes('href="#setup-call">Book setup consultation →</a>'));
assert(services.includes('href="#bot-builder">Request a quote →</a>'));
assert(services.includes("scope, delivery/access method, and onboarding next steps"));
assert(services.includes("assumptions, deliverables, dependencies, and a quote"));
assert(services.includes("Vixale does not trade or manage customer brokerage accounts"));
assert(!services.includes("$99") && !services.includes("per month") && !services.includes("monthly price"));
for (const needle of SERVICE_SECTION_NEEDLES) assert(services.includes(needle));
assert(services.includes('id="setup-form"'));
assert(services.includes('href="/#live"'));
assert(services.includes('href="#setup-call"'));
assert(services.includes('href="/#password-access">Request Free Access</a>'));
assert(!services.includes('href="#password-access"'));
assert(!services.includes('href="/services#password-access"'));
assert(!services.includes("Simple steps. Clear choices."));
assert(!services.includes("Have an audience? Launch a trading product with Vixale."));
assert(services.includes("https://www.vixale.com/services"));

const pricing = renderPricingFromLanding(sample);
assert(pricing.includes("<title>Vixale | Watch System for Free</title>"));
assert(pricing.includes("Watch Vixale before you decide."));
assert(pricing.includes('href="/#password-access">Request Free Access</a>'));
assert(pricing.includes('href="/trading-systems">Explore Trading Systems</a>'));
assert(pricing.includes("verify your email, and wait for manual review"));
assert(pricing.includes("Four simple steps."));
assert(pricing.includes("Verify your email"));
assert(pricing.includes("Await manual review"));
assert(pricing.includes("Receive your code"));
assert(pricing.includes("Spam/Junk"));
assert(pricing.includes("Active trade ideas the system is watching."));
assert(!pricing.includes("7 days"));
assert(!pricing.includes("7-Day"));
assert(!pricing.includes("Coming Soon"));
assert(!pricing.includes("What can we help you with?"));
assert(pricing.includes("https://www.vixale.com/pricing"));

const systems = '<html><body><nav><div class="nav-links"><a href="/">Home</a></div></nav></body></html>';
const systemsOut = injectRiskManagementNav(systems);
assert(systemsOut.includes('class="vx-risk-management-nav-link"'));
assert(systemsOut.includes('href="/risk-management">Risk Management</a>'));
assert.strictEqual(injectRiskManagementNav(systemsOut), systemsOut, "Risk Management nav injection must be idempotent");

console.log("Public IA refinement contract: PASS");