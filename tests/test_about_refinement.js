"use strict";

const assert = require("assert");
const {
  ABOUT_PATH,
  STYLE_ID,
  insertAboutNavLink,
  refineAboutExperience,
} = require("../website_about_refinement");

const base = `<!doctype html><html><head><title>Vixale</title><meta name="description" content="old"><link rel="canonical" href="https://www.vixale.com/"></head><body><nav><div class="nav-links"><a href="/">Home</a><a href="/trading-systems">Trading Systems</a><a href="https://t.me/tradervip22">Telegram</a><a href="/services">Services</a><a href="/pricing">Watch System for Free</a><a href="/dashboard">Live Dashboard</a></div></nav><main><section>Existing homepage</section></main><footer>Footer</footer></body></html>`;

const nav = insertAboutNavLink(base);
assert(nav.includes('<a href="/about">About</a><a href="/services">Services</a>'));
assert.strictEqual(insertAboutNavLink(nav), nav);

const home = refineAboutExperience(base, "/");
assert(home.includes(`id="${STYLE_ID}"`));
assert(home.includes('class="vx-home-credibility"'));
assert(home.includes("Independent · Founder-operated"));
assert(home.includes("Systematic Trader &amp; Software Developer"));
assert(home.includes("does not trade or manage customer brokerage accounts"));
assert(home.includes('href="/about">About Vixale →</a>'));

const about = refineAboutExperience(base, ABOUT_PATH);
assert(about.includes('class="vx-about-page"'));
assert(about.includes("<title>Vixale | About</title>"));
assert(about.includes('href="https://www.vixale.com/about"'));
assert(about.includes("About the Founder"));
assert(about.includes("Founder &amp; Operator"));
assert(about.includes("Systematic Trader &amp; Software Developer"));
assert(about.includes("No customer account management"));
assert(about.includes("does not trade or manage customer brokerage accounts"));
assert(!about.includes("Our Team"));
assert(!about.includes("Investment Advisor"));
assert(!about.includes("registered adviser"));
assert.strictEqual(refineAboutExperience(about, ABOUT_PATH), about);
assert.strictEqual(refineAboutExperience(base, "/dashboard"), base);

console.log("About Vixale / founder credibility: PASS");
