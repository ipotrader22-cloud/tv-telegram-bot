"use strict";

const assert = require("assert");
const {
  STYLE_ID,
  refineHomepage,
} = require("../website_home_conversion_refinement");

const sample = `<!doctype html><html><head><title>Vixale | Watch a Live Trading System</title></head><body><main>
<section class="old-hero"><div class="wrap"><div>Vixale live dashboard</div><h2><a href="/dashboard">Watch the systems live.</a></h2><p>See the signals. See the trades. See the results.</p><p>Follow live signals, open trades, and recorded results in one private dashboard.</p><div><a href="#access">Request Dashboard Access</a><a href="https://t.me/vixale">Get Telegram Signals</a><a href="/dashboard">Dashboard Login</a></div></div></section>
<section id="live"><h2>Live Trade Dashboard</h2></section>
<section id="access"><h2>Request access to the live dashboard.</h2><form></form></section>
</main></body></html>`;

const out = refineHomepage(sample);
assert(out.includes("Watch our trading systems live before you trade them."));
assert(out.includes('href="#access">Request 7-Day Access</a>'));
assert(out.includes('href="/trading-systems">Explore Trading Systems</a>'));
assert(out.includes("Read-only dashboard · Manual approval · Individual access code"));
assert(out.includes('Already have access? <a href="/dashboard">Dashboard Login</a>'));
assert(!out.includes("Get Telegram Signals"));
assert(!out.includes("Request Dashboard Access"));
assert(!out.includes("Watch the systems live."));
assert(out.includes("Live Trade Dashboard"));
assert(out.includes("Request access to the live dashboard."));
assert(out.includes(`id="${STYLE_ID}"`));
assert.strictEqual((out.match(/Request 7-Day Access/g) || []).length, 1);
assert.strictEqual(refineHomepage(out), out, "homepage refinement must be idempotent");
assert.strictEqual(refineHomepage("<html><body>No matching hero</body></html>"), "<html><body>No matching hero</body></html>");

console.log("Homepage primary conversion refinement: PASS");
