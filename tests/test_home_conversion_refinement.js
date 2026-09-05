"use strict";

const assert = require("assert");
const {
  STYLE_ID,
  refineHomepage,
} = require("../website_home_conversion_refinement");

const sample = `<!doctype html><html><head><title>Vixale | Watch a Live Trading System</title></head><body><main>
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
</main></body></html>`;

const out = refineHomepage(sample);
assert(out.includes("Watch our trading systems live before you trade them."));
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
assert(out.includes(`id="${STYLE_ID}"`));
assert.strictEqual((out.match(/Request 7-Day Access/g) || []).length, 1);
assert.strictEqual(refineHomepage(out), out, "homepage refinement must be idempotent");

const nonHeroLookalike = sample.replace('class="wrap hero"', 'class="wrap preview"');
assert.strictEqual(refineHomepage(nonHeroLookalike), nonHeroLookalike, "non-hero lookalikes must not be replaced");
assert.strictEqual(refineHomepage("<html><body>No matching hero</body></html>"), "<html><body>No matching hero</body></html>");

console.log("Homepage primary conversion refinement: PASS");
