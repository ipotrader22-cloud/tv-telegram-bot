"use strict";

const assert = require("assert");
const {
  ABOUT_PATH,
  STYLE_ID,
  FOUNDER_SENTENCE,
  refineAboutCopy,
} = require("../website_about_copy_polish");

const about = `<!doctype html><html><head></head><body><main><section class="vx-about-page"><header class="vx-about-hero"><h1>About Vixale</h1></header><article><p>${FOUNDER_SENTENCE}The work combines systematic trading research, software development, automation, monitoring, and the public presentation of system activity and results.</p></article></section></main></body></html>`;

const polished = refineAboutCopy(about, ABOUT_PATH);
assert(polished.includes(`id="${STYLE_ID}"`));
assert(polished.includes(".vx-about-hero h1{font-size:clamp(28px,3.5vw,41px)}"));
assert(!polished.includes(FOUNDER_SENTENCE));
assert(polished.includes("The work combines systematic trading research"));
assert(!polished.includes("two professional trading software developers"));
assert.strictEqual(refineAboutCopy(polished, ABOUT_PATH), polished);
assert.strictEqual(refineAboutCopy(about, "/"), about);

console.log("About copy polish: PASS");
