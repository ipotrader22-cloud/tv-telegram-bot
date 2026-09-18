"use strict";
const assert=require("assert");
const fs=require("fs");
const results=require("../website_conversion_results_refinement");

const html=results.renderResultsMain();
assert(html.includes("Trading results, by system."));
assert(html.includes("DAY TRADING · LIVE / REALIZED"));
assert(html.includes("SWING TRADING · RESEARCH / MODEL"));
assert(html.includes("OPTIONS · OWNER-ENTERED JOURNAL"));
assert(html.includes("No combined Vixale performance total."));
assert(html.includes("No public sample P&amp;L is substituted."));
assert(html.includes("Research/model portfolio · not brokerage-account performance"));
assert(html.includes('/closed-trades'));
assert(html.includes('/trading-systems/swing-trading#active-portfolio'));
assert(html.includes('/trading-systems/options/viewer'));

const base='<!doctype html><html><head><title>Old</title></head><body><header>KEEP</header><main><div>OLD RESULTS</div></main><footer>KEEP FOOTER</footer></body></html>';
const refined=results.refineResults(base);
assert(refined.includes('<title>Vixale | Results</title>'));
assert(!refined.includes('OLD RESULTS'));
assert(refined.includes('KEEP'));
assert(refined.includes('KEEP FOOTER'));
assert(refined.includes('id="vx-conversion-results-script"'));
assert(refined.includes("fetch('/public-performance.json'"));
assert(refined.includes("fetch('/public-live-open-pnl.json'"));
assert(refined.includes("fetch('/api/swing-leaders'"));
assert(!refined.includes('setInterval('));
assert(refined.includes('@media(max-width:480px)'));

const packageJson=JSON.parse(fs.readFileSync(require.resolve('../package.json'),'utf8'));
assert(packageJson.scripts.start.startsWith('node -r ./website_conversion_results_refinement.js -r ./website_conversion_system_pages_refinement.js'));
console.log('Issue #123 PR4 Results regression PASS');
