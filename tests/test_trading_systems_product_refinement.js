"use strict";
const assert=require("assert");
const {
  SYSTEMS_PATH,DAY_PATH,SWING_PATH,OPTIONS_PATH,OPTIONS_VIEWER_PATH,RESULTS_PATH,
  STYLE_ID,PAGE_MARKER,refineTradingSystemsProductPage
}=require("../website_trading_systems_product_refinement");

const base=`<!doctype html><html><head><title>Old Systems</title><link rel="canonical" href="https://www.vixale.com/old"></head><body><nav><div class="nav-links"><a class="vx-beginner-nav-link" href="/trading-guide">Beginner Guide</a><a class="vx-risk-management-nav-link" href="/risk-management">Risk Management</a><a href="/">Live System</a><a href="/trading-systems">Trading Systems</a><a href="#start-here">Start Here</a><a href="#services">Why It Makes Sense</a><a href="/pricing">7 Days Free</a><a href="/dashboard">Live Dashboard</a></div></nav><main><h1>old wall of text</h1><h2>Systems at a glance.</h2><div>Market Coverage</div></main><footer>Important disclosure</footer></body></html>`;

function inOrder(html,labels,message){
  let at=-1;
  for(const label of labels){
    const next=html.indexOf(label,at+1);
    assert(next>at,`${message}: missing/out-of-order ${label}`);
    at=next;
  }
}

const hub=refineTradingSystemsProductPage(base,SYSTEMS_PATH);
assert(hub.includes(`${PAGE_MARKER}="${SYSTEMS_PATH}"`));
assert(hub.includes(`id="${STYLE_ID}"`));
assert(hub.includes("Choose the trading category that fits how you want to follow the market."));
assert(hub.includes("Strategy names come after you choose a category."));
assert(hub.includes(`href="${DAY_PATH}"`)&&hub.includes(`href="${SWING_PATH}"`)&&hub.includes(`href="${OPTIONS_PATH}"`));
assert(!hub.includes("Systems at a glance.")&&!hub.includes("Market Coverage")&&!hub.includes("old wall of text"));
assert(hub.includes("<title>Vixale | Trading Systems</title>"));
assert(hub.includes('href="/access">Request Free Access</a>'));
assert(hub.includes(`href="${RESULTS_PATH}">Explore Results</a>`));
for(const label of ["Holding horizon","How often to check","Public now","Viewer access"])assert(hub.includes(`<dt>${label}</dt>`),`missing comparison label ${label}`);
assert(hub.includes("Usually intraday; some approved positions may remain open overnight"));
assert(hub.includes("The Swing model portfolio itself is already public"));
assert(hub.includes("Protected journal detail and available owner-provided proofs"));
for(const internalName of ["Vixale Prime","Vixale Edge","Vixale Swing System","Swing Leaders","Options Straddles"])assert(!hub.includes(internalName),`hub must stay category-first: ${internalName}`);

const day=refineTradingSystemsProductPage(base,DAY_PATH);
assert(day.includes("Day Trading: intraday-first stock signals and status."));
assert(day.includes("Unlike Swing Trading")&&day.includes("unlike Options"));
inOrder(day,["How it differs","What you will see","Vixale Prime","Vixale Edge","Available publicly now","What viewer access adds","Day Trading results.","Want the read-only Day Trading dashboard?"],"Day page teaching sequence");
assert(day.includes("Pending setups may be visible before entry"));
assert(day.includes("An approved Edge position can remain open overnight when its rules require it"));
assert(!day.includes("Working orders may be visible before fill"));
assert(!day.includes("Options Straddles")&&!day.includes("Vixale Swing System"));
assert(day.includes("<title>Vixale | Day Trading Systems</title>"));
assert(day.includes(`href="https://www.vixale.com${DAY_PATH}"`));
assert(day.includes(`href="${RESULTS_PATH}#day-trading">Day Trading Results</a>`));
assert(day.includes('href="/closed-trades">Closed Trades Archive</a>'));
assert(!day.includes('href="/dashboard">Log In to Dashboard</a>'));
assert.strictEqual((day.match(/>Request Free Access<\/a>/g)||[]).length,1,"Day page must have one page-specific access CTA");

const swing=refineTradingSystemsProductPage(base,SWING_PATH);
inOrder(swing,["Swing Trading: a public multi-session research/model portfolio.","How it differs","What you will see","Available publicly now","What viewer access adds","Swing Trading results.","Ready to inspect the Swing portfolio?"],"fallback Swing teaching sequence");
assert(swing.includes("The Swing model portfolio itself is already public."));
assert(swing.includes("Viewer access is used for other protected Vixale sections"));
assert(!swing.includes("Vixale Prime")&&!swing.includes("Options Straddles"));

const options=refineTradingSystemsProductPage(base,OPTIONS_PATH);
assert.strictEqual(OPTIONS_VIEWER_PATH,`${OPTIONS_PATH}/viewer`);
assert(options.includes("Options: journal-based evidence with protected detail."));
inOrder(options,["How it differs","What you will see","Available publicly now","What viewer access adds","Options evidence.","Want to inspect the protected Options journal?"],"Options page teaching sequence");
assert(options.includes("owner-entered Option Journal"));
assert(options.includes("closed-only realized P&L equity grouped by Exit Date"));
assert(options.includes("owner-provided brokerage screenshots"));
assert(options.includes(`href="${RESULTS_PATH}#options">Options Results</a>`));
assert(options.includes(`href="${OPTIONS_VIEWER_PATH}">Options Viewer</a>`));
assert(!options.includes('href="/#live-day-trading">Live Performance</a>'));
assert(!options.includes('href="/closed-trades">Closed Trades Archive</a>'));
assert.strictEqual((options.match(/>Request Free Access<\/a>/g)||[]).length,1,"Options page must have one page-specific next action");
assert(!options.includes('<a class="vx-systems-btn primary" href="'+OPTIONS_VIEWER_PATH+'">Options Viewer</a>'),"Options viewer must not compete as a second hero primary CTA");
assert(!options.includes("Options Straddles")&&!options.includes("Vixale Prime")&&!options.includes("Vixale Swing System"));
assert(options.includes(".vx-system-section"));
assert(options.includes("@media(max-width:700px)"),"system sequence must retain mobile layout");

assert.strictEqual(refineTradingSystemsProductPage(hub,SYSTEMS_PATH),hub);
assert.strictEqual(refineTradingSystemsProductPage(base,"/"),base);
console.log("Issue #107 PR3 system-page sequence: PASS");
