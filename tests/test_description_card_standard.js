"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const cards = require("../website_description_card_standard");

assert(pkg.scripts.start.startsWith("node -r ./website_conversion_final_qa_refinement.js -r ./website_description_card_standard.js"));

const base = `<!doctype html><html><head></head><body>
<section class="vx-conversion-home"><div class="vx-conversion-hero-copy"><p>Home description</p></div></section>
<section class="vx-conversion-system-hero"><div><p>System description</p></div></section>
<section class="vx-results-intro"><p>Results description</p></section>
<section data-vx-conversion-system-page="swing"><div class="hero"><p class="hero-copy">Swing description</p></div></section>
</body></html>`;

const out = cards.injectDescriptionCardStyles(base);
assert(out.includes(`id="${cards.STYLE_ID}"`));
assert(out.includes("linear-gradient(135deg,#eaf8f0 0%,#f6fbf8 52%,#fff 100%)"));
assert(out.includes(".vx-conversion-hero-copy>p"));
assert(out.includes(".vx-conversion-system-hero>div>p"));
assert(out.includes(".vx-results-intro>p"));
assert(out.includes('[data-vx-conversion-system-page="swing"] .hero .hero-copy'));
assert(out.includes(".vx-swing-how-list>p"));
assert(out.includes(".vx-conversion-system-cards>article"));
assert(out.includes(".vx-conversion-proof-row>article"));
assert(out.includes("border-radius:24px!important"));
assert(out.includes("border-radius:21px!important"));
assert.strictEqual(cards.injectDescriptionCardStyles(out), out, "description-card style injection must be idempotent");

console.log("Description-card visual standard: PASS");
