"use strict";

const assert = require("node:assert/strict");
const {
  renderHeroAndPreview,
  renderIntroVideo,
  refineConversionHomepage,
} = require("../website_conversion_home_refinement");

const clip = renderIntroVideo();
assert.match(clip, /id="meet-vixale-video"/);
assert.match(clip, /Three trading systems\. One platform\./);
assert.match(clip, /Три торговые системы\. Одна платформа\./);
assert.match(clip, /video charts and portfolios are illustrative/i);
assert.match(clip, /<iframe[^>]*loading="lazy"/);
assert.match(clip, /<video[^>]*controls preload="none" playsinline>/);
assert.match(clip, /app\.heygen\.com\/embeds\/5b58c907fc054fe7b8a6807ccfd69633/);
assert.match(clip, /resource2\.heygen\.ai\/video_translate\/cc6bde06dc634fb2a1ba927cfb1a426e-ru\/original\.mp4/);
assert(!clip.includes("Expires="), "Use a stable URL, not a temporary signed download link.");
assert(!clip.includes("autoplay"), "Playback must start only by user interaction.");

const hero = renderHeroAndPreview();
assert(hero.indexOf('class="vx-conversion-hero-grid"') < hero.indexOf('id="meet-vixale-video"'));
assert(hero.indexOf('id="meet-vixale-video"') < hero.indexOf('class="vx-conversion-system-cards"'));
assert.match(hero, /href="#meet-vixale-video"/);
assert.match(hero, /Watch 55-second overview/);
assert.match(hero, /Смотреть обзор/);
assert.match(hero, /vx-conversion-product-preview/);
assert.match(hero, /vx-conversion-system-cards/);

const input = '<!doctype html><html lang="en"><head></head><body><section class="vx-home-top-systems"><p>Existing content</p></section></body></html>';
const output = refineConversionHomepage(input);
assert.equal((output.match(/id="meet-vixale-video"/g) || []).length, 1);
assert.equal((output.match(/vx-home-overview-hero-link/g) || []).length >= 1, true);
assert.match(output, /@media\(max-width:600px\).*?vx-home-overview/);
assert.match(output, /html\[lang="ru"\] video\.vx-overview-ru\{display:block!important\}/);
assert.equal(refineConversionHomepage(output), output, "Homepage refinement must be idempotent.");
console.log("Home intro video tests passed: EN/RU, placement, accessibility, fallback, responsive styling, and idempotence.");
