"use strict";

const assert = require("assert");
const fs = require("fs");
const finalQa = require("../website_conversion_final_qa_refinement");
const guide = require("../website_trading_guide");

const guideHtml = finalQa.refineGuideHtml(guide.renderTradingGuideHtml());
assert(guideHtml.includes("Options · Protected workflow"));
assert(guideHtml.includes("Follow positions from open to close."));
assert(guideHtml.includes("Options remains a website-update product in this release."));
assert(guideHtml.includes("Viewer access"));
assert(guideHtml.includes("Single System"));
assert(guideHtml.includes("$49/month"));
assert(guideHtml.includes("Three-System Bundle"));
assert(guideHtml.includes("$99/month"));
assert(guideHtml.includes("30-day Day Trading trial"));
assert(guideHtml.includes("Services"));
assert(guideHtml.includes("aria-labelledby=\"vx-guide-options-title\""));
assert(!guideHtml.includes("Watch 6:00–8:30 PM ET"));
assert(!guideHtml.includes("SPY straddle example"));
assert(!guideHtml.includes("1 SPY STRADDLE"));
assert(!guideHtml.includes("Place a +10% target"));
assert(!guideHtml.includes("Follow hedge / exit updates"));

const compact = finalQa.refineSystemsHtml(guide.renderCompactGuidePanel());
assert(compact.includes("Protected journal → Daily updates → Closed evidence"));
assert(compact.includes("Options is a website-update product."));
assert(!compact.includes("Watch → Straddle → +10% → Follow Updates"));
assert(!compact.includes("1 SPY straddle"));

const pricingFixture = '<!doctype html><html><head><title>Old pricing</title><meta name="description" content="old"><link rel="canonical" href="https://www.vixale.com/old"><meta property="og:title" content="old"><meta property="og:description" content="old"><meta property="og:url" content="https://www.vixale.com/old"></head><body></body></html>';
const pricing = finalQa.refinePricingSeo(pricingFixture);
assert(pricing.includes(finalQa.PRICING_TITLE));
assert(pricing.includes('$49 Single System'));
assert(pricing.includes('$99 Three-System Bundle'));
assert(pricing.includes('30-day Day Trading Telegram signals trial'));
assert(pricing.includes('rel="canonical" href="https://www.vixale.com/pricing"'));
assert(pricing.includes('property="og:url" content="https://www.vixale.com/pricing"'));

const sitemap = finalQa.refineSitemapXml('<?xml version="1.0"?><urlset><url><loc>https://www.vixale.com/</loc></url></urlset>');
assert(sitemap.includes('<loc>https://www.vixale.com/pricing</loc>'));
assert.strictEqual((sitemap.match(/https:\/\/www\.vixale\.com\/pricing/g) || []).length, 1);

const homeFixture = '<!doctype html><html><head></head><body><section class="vx-conversion-home"><div class="vx-conversion-hero-copy"><h1>Trading signals. Three systems. Your choice.</h1></div><div id="vx-conversion-day-chart"></div><h3 id="vx-home-equity-title">Open P&amp;L Equity Curve</h3><div id="vx-home-equity-stage"></div><div id="vx-home-equity-empty"></div></section></body></html>';
const home = finalQa.refineHomeHtml(homeFixture);
assert(home.includes('font-size:clamp(30px,3.5vw,42px)!important'));
assert(home.includes('Realized P&amp;L Equity Curve'));
assert(home.includes('id="vx-issue123-pr7-final-script"'));
assert(home.includes("fetch('/public-performance.json'"));
assert(home.includes("document.getElementById('vx-conversion-day-chart')"));
assert(home.includes("document.getElementById('vx-home-equity-stage')"));
assert(home.includes('@media(max-width:720px)'));

const pdf = finalQa.loadGuidePdfBuffer();
assert(pdf.length > 5000);
assert.strictEqual(pdf.subarray(0, 4).toString("ascii"), "%PDF");

const packageJson = JSON.parse(fs.readFileSync(require.resolve("../package.json"), "utf8"));
assert(packageJson.scripts.start.startsWith("node -r ./website_conversion_final_qa_refinement.js -r ./website_conversion_access_services_refinement.js"));

console.log("Issue #123 PR7 final QA regression PASS");
