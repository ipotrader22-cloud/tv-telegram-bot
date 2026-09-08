"use strict";

const assert = require("assert");
const {
  STYLE_ID,
  FLOW_MARKER,
  SERVICES_INTRO_MARKER,
  refineAccessTruthHtml,
} = require("../website_access_truth_refinement");

const home = `<!doctype html><html><head></head><body><main>
<section class="vx-home-hero"><a href="#password-access">Request 7-Day Access</a><p>Read-only dashboard · Manual approval · Individual access code</p></section>
<section id="password-access"><h2>Request access to the live dashboard.</h2><p>Send a short access request. Every request is reviewed manually before an individual dashboard code is created.</p><p>Once approved, you will receive a reply by email with the login instructions.</p><div>Reviewed. Access is never granted automatically.</div><div>Direct. The approval response goes to your email.</div><div>Private. Every approved viewer receives an individual access code.</div><form><button>Request Dashboard Access</button></form></section>
</main></body></html>`;
const homeOut = refineAccessTruthHtml(home, "/");
assert(homeOut.includes("Request Free Access"));
assert(!homeOut.includes("7-Day"));
assert(homeOut.includes("Email verification · Manual review · Individual viewer code"));
assert(homeOut.includes(FLOW_MARKER));
assert(homeOut.includes("2. Verify your email"));
assert(homeOut.includes("3. Await manual review"));
assert(homeOut.includes("Spam/Junk"));
assert(homeOut.indexOf(FLOW_MARKER) < homeOut.indexOf("<form"));
assert(homeOut.includes(`id="${STYLE_ID}"`));

const services = `<!doctype html><html><head></head><body><main><section><h2>What can we help you with?</h2><a href="#password-access">Request Dashboard Access</a></section></main></body></html>`;
const servicesOut = refineAccessTruthHtml(services, "/services");
assert(servicesOut.includes(`class="wrap section ${SERVICES_INTRO_MARKER}"`));
assert(servicesOut.includes('<h1 id="vx-services-title">Vixale Services</h1>'));
assert(servicesOut.includes('href="/#password-access">Request Free Access</a>'));
assert.strictEqual((servicesOut.match(/<h1\b/g) || []).length, 1);

const pricing = `<!doctype html><html><head></head><body><main><div class="vx-watch-hero"><div>7 Days Free</div><a href="/#access">Request 7-Day Access</a><p>Read-only access · Manual approval · Individual dashboard code</p></div><div class="vx-perf-cta"><span>Watch the read-only dashboard for 7 days before deciding what to do next.</span></div><div class="vx-watch-steps"><div class="vx-watch-step"><b>1</b></div><div class="vx-watch-step"><b>2</b></div><div class="vx-watch-step"><b>3</b><strong>Watch for 7 days</strong></div></div></main></body></html>`;
const pricingOut = refineAccessTruthHtml(pricing, "/pricing");
assert(pricingOut.includes("Free Access"));
assert(pricingOut.includes("Request Free Access"));
assert(pricingOut.includes('href="/#password-access"'));
assert(!pricingOut.includes("7 days"));
assert(pricingOut.includes("Verify your email"));
assert(pricingOut.includes("Await manual review"));
assert(pricingOut.includes("Receive your code"));
assert.strictEqual((pricingOut.match(/class="vx-watch-step"/g) || []).length, 4);

assert.strictEqual(refineAccessTruthHtml("<html><body>unchanged</body></html>", "/about"), "<html><body>unchanged</body></html>");
assert.strictEqual(refineAccessTruthHtml(homeOut, "/"), homeOut, "home access truth refinement must be idempotent");

console.log("Access truth + Services refinement: PASS");
