"use strict";

const assert = require("assert");
const {
  HOME_REMOVE_SECTION_NEEDLES,
  STYLE_ID,
  refineHomepage,
} = require("../website_home_conversion_refinement");

const sample = `<!doctype html><html><head><title>Vixale | Watch a Live Trading System</title><style>.hero h1{white-space:nowrap}</style></head><body><main>
<section class="wrap hero">
  <div>
    <div class="hero-kicker">Vixale live dashboard</div>
    <a class="hero-title-link" href="/login" aria-label="Open Live Trade Dashboard">
      <h1>Watch the <span class="accent">systems live.</span></h1>
    </a>
    <div class="smart-slogan">See the signals. See the trades. See the results.</div>
    <p class="hero-text">Follow live signals, open trades, and recorded results in one private dashboard.</p>
    <div class="actions">
      <a class="btn btn-primary" href="#password-access">Request Dashboard Access</a>
      <a class="btn btn-green" href="https://t.me/vixale">Get Telegram Signals</a>
      <a class="btn" href="/login">Dashboard Login</a>
    </div>
    <p class="hero-note">The live dashboard is access-controlled. Approved viewers receive an individual code for the read-only dashboard.</p>
  </div>
</section>
<section id="live"><h2>Live Trade Dashboard</h2></section>
<section id="password-access"><h2>Request access to the live dashboard.</h2><form></form></section>
<section><div>Start simple: watch first</div><h2>You can start without trading anything.</h2></section>
<section><div>First you watch. Then you decide.</div><h2>See what the system is doing.</h2></section>
<section><h2>Simple steps. Clear choices.</h2></section>
<section id="start-here"><h2>New to trading systems? Start here.</h2><p>No hype. Clear tracking, simple explanations, and honest feedback.</p></section>
<section><h2>Have an audience? Launch a trading product with Vixale.</h2></section>
<section><h2>Start by watching the live system.</h2></section>
<footer>Important Risk Disclosure</footer>
</main></body></html>`;

const out = refineHomepage(sample);
assert(out.includes("Watch our trading systems live before you trade them."));
assert(out.includes('class="vx-home-hero-kicker" href="/dashboard"'));
assert(out.includes('aria-label="Open Vixale Live Dashboard"'));
assert(out.includes('href="#password-access">Request 7-Day Access</a>'));
assert(out.includes('href="/trading-systems">Explore Trading Systems</a>'));
assert(out.includes("Read-only dashboard · Manual approval · Individual access code"));
assert(out.includes('Already have access? <a href="/dashboard">Dashboard Login</a>'));
assert(!out.includes("Get Telegram Signals"));
assert(!out.includes("Request Dashboard Access"));
assert(!out.includes('Watch the <span class="accent">systems live.</span>'));
assert(out.includes("Live Trade Dashboard"));
assert(out.includes("Request access to the live dashboard."));
assert(out.includes('id="password-access"'));
assert(out.includes('id="start-here"'));
assert(out.includes("New to trading systems? Start here."));
assert(out.includes("Important Risk Disclosure"));
for (const needle of HOME_REMOVE_SECTION_NEEDLES) assert(!out.includes(needle), `duplicate homepage section must be removed: ${needle}`);
const heroIndex = out.indexOf("Watch our trading systems live before you trade them.");
const dashboardIndex = out.indexOf("Live Trade Dashboard");
const accessIndex = out.indexOf("Request access to the live dashboard.");
const startHereIndex = out.indexOf("New to trading systems? Start here.");
const riskIndex = out.indexOf("Important Risk Disclosure");
assert(heroIndex < dashboardIndex, "hero must remain before the live dashboard");
assert(dashboardIndex < accessIndex, "live dashboard must remain before the access form");
assert(accessIndex < startHereIndex, "access form must remain before Start Here");
assert(startHereIndex < riskIndex, "Start Here must remain before the risk/legal footer");
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes("white-space:normal !important"));
assert(out.includes("font-size:clamp(40px,4.8vw,60px)"));
assert(out.includes("padding:56px 0 52px"));
assert.strictEqual((out.match(/Request 7-Day Access/g) || []).length, 1);
assert.strictEqual(refineHomepage(out), out, "homepage refinement must be idempotent");

const nonHeroLookalike = sample.replace('class="wrap hero"', 'class="wrap preview"');
assert.strictEqual(refineHomepage(nonHeroLookalike), nonHeroLookalike, "non-hero lookalikes must not be altered or cleaned up");
assert.strictEqual(refineHomepage("<html><body>No matching hero</body></html>"), "<html><body>No matching hero</body></html>");

console.log("Homepage hero layout and cleanup refinement: PASS");
