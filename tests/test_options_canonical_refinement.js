"use strict";

const assert = require("assert");
const packageJson = require("../package.json");
const {
  OPTIONS_PATH,
  DASHBOARD_PATH,
  OPTIONS_CANONICAL_URL,
  OPTION_JOURNAL_RANGE,
  OPTIONS_PAGE_MARKER,
  parseOptionJournalRows,
  optionPnl,
  buildOptionsEquityCurve,
  refineDayTradingDashboard,
  refineOptionsPageFromDashboard,
  installOptionsCanonicalRefinement,
} = require("../website_options_canonical_refinement");

const startCommand = packageJson.scripts.start;
assert(startCommand.includes("-r ./website_options_canonical_refinement.js"), "Options canonical refinement must be preloaded");
assert(startCommand.indexOf("-r ./website_options_canonical_refinement.js") < startCommand.indexOf("-r ./website_trading_systems_product_refinement.js"), "Options canonical refinement must load before the Trading Systems product refinement");

const values = [
  ["ID","Trade Date","Entry Time","Symbol","Strategy","Legs","Expiration","Contracts","Multiplier","Trade Type","Entry Price","Exit Date","Exit Time","Exit Price","Fees","Status","Notes","Created At","Updated At"],
  ["1","2026-08-31","","SPY","Straddle","","2026-09-04","2","100","Credit","5","2026-09-01","","2","10","Closed"],
  ["2","2026-08-31","","QQQ","Single Call","","2026-09-04","1","100","Debit","1","2026-09-01","","2.5","5","Closed"],
  ["3","2026-09-01","","IWM","Strangle","","2026-09-05","1","100","Credit","3","","","","0","Open"],
  ["4","2026-09-01","","AAPL","Vertical Spread","","2026-09-06","1","100","Credit","4","2026-09-02","","5","0","Closed"],
  ["5","2026-09-01","","MSFT","Vertical Spread","","2026-09-06","1","100","Credit","4","bad-date","","2","0","Closed"],
];
const trades = parseOptionJournalRows(values);
assert.strictEqual(OPTION_JOURNAL_RANGE, "'Option Journal'!A:S");
assert.strictEqual(trades.length, 5);
assert.strictEqual(optionPnl(trades[0]), 590);
assert.strictEqual(optionPnl(trades[1]), 145);
assert.strictEqual(optionPnl(trades[2]), null);
const curve = buildOptionsEquityCurve(trades);
assert.deepStrictEqual(curve, {
  points: [
    { date: "2026-09-01", daily_pnl: 735, cumulative_pnl: 735 },
    { date: "2026-09-02", daily_pnl: -100, cumulative_pnl: 635 },
  ],
  total_realized_pnl: 635,
});

const dashboardHtml = `<!doctype html><html><head><title>Vixale Live Strategy Dashboard</title><meta http-equiv="refresh" content="30" /><style>.section{}.hero{}.equity-line{}</style></head><body>
<div class="wrap"><div class="top-actions"><div class="left-links"><a href="#option-journal">Option Journal</a></div></div>
<div class="hero"><h1>Vixale Live Strategy Dashboard</h1><div class="subtitle">Private live forward-test / paper-trading tracker</div><div class="strategy-notes"><div class="strategy-note"><strong>Vixale Prime</strong>Prime text</div><div class="strategy-note"><strong>Vixale Edge</strong>Edge text</div><div class="strategy-note"><strong>Option Straddles</strong>Options text</div></div></div>
<div class="section" id="day-equity">DAY EQUITY</div><div class="section" id="open-positions">OPEN POSITIONS</div>
<div class="section" id="option-journal"><div class="section-header option-journal-head"><h2>Option Journal</h2></div><div class="table-wrap"><table><tbody><tr><td>SPY</td><td><a href="/dashboard/options/abc/proofs/def">Proof 1</a></td></tr></tbody></table></div></div>
<div class="footer">OLD FOOTER</div><script>OLD DASHBOARD SCRIPT</script></div></body></html>`;

const day = refineDayTradingDashboard(dashboardHtml);
assert(day.includes("Vixale | Live Day Trading Dashboard"));
assert(day.includes("Vixale Live Day Trading Dashboard"));
assert(day.includes("Private live day-trading forward-test / paper-trading tracker"));
assert(!day.includes('id="option-journal"'));
assert(!day.includes('href="#option-journal"'));
assert(!day.includes("Option Straddles"));
assert(day.includes("Vixale Prime"));

const options = refineOptionsPageFromDashboard(dashboardHtml, curve, false);
assert(options.includes(`${OPTIONS_PAGE_MARKER}="page"`));
assert(options.includes("<title>Vixale | Options Trading</title>"));
assert(options.includes(`<link rel="canonical" href="${OPTIONS_CANONICAL_URL}" />`));
assert(!options.includes('http-equiv="refresh"'));
assert(options.includes("Vixale Options"));
assert(options.includes("Options Equity Curve — Realized P&amp;L"));
assert(options.includes("Total Realized Options P&amp;L"));
assert(options.includes("+$635.00"));
assert(options.includes("2026-09-01"));
assert(options.includes('href="/dashboard/options/abc/proofs/def"'));
assert(options.includes('href="/#password-access">Watch Systems for Free</a>'));
assert(!options.includes("DAY EQUITY"));
assert(!options.includes("OPEN POSITIONS"));
assert(!options.includes("OLD DASHBOARD SCRIPT"));
assert.strictEqual(refineOptionsPageFromDashboard(options, curve, false), options, "Options transform must be idempotent by source guard");

function capture(deps) {
  let middleware = null;
  installOptionsCanonicalRefinement({ use(fn) { middleware = fn; } }, deps);
  assert.strictEqual(typeof middleware, "function");
  return middleware;
}
function responseHarness() {
  return { statusCode: 200, sent: null, getHeader() { return "text/html; charset=utf-8"; }, send(body) { this.sent = body; return this; } };
}

(async () => {
  let loadCalls = 0;
  const middleware = capture({ loadOptionsEquityFromSheets: async () => { loadCalls += 1; return curve; } });
  const req = { method: "GET", path: OPTIONS_PATH, url: `${OPTIONS_PATH}?key=test`, _parsedUrl: {} };
  const res = responseHarness();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });
  assert.strictEqual(nextCalls, 1);
  assert.strictEqual(req.url, `${DASHBOARD_PATH}?key=test`, "Options must reuse existing dashboard authorization/session path");
  assert(!Object.prototype.hasOwnProperty.call(req, "_parsedUrl"));
  res.send(dashboardHtml);
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(loadCalls, 1);
  assert(res.sent.includes(`${OPTIONS_PAGE_MARKER}="page"`));

  const dayMiddleware = capture({ loadOptionsEquityFromSheets: async () => { throw new Error("must not run"); } });
  const dayReq = { method: "GET", path: DASHBOARD_PATH, url: DASHBOARD_PATH };
  const dayRes = responseHarness();
  dayMiddleware(dayReq, dayRes, () => {});
  dayRes.send(dashboardHtml);
  assert(dayRes.sent.includes("Live Day Trading Dashboard"));
  assert(!dayRes.sent.includes('id="option-journal"'));

  const redirectReq = { method: "GET", path: OPTIONS_PATH, url: OPTIONS_PATH };
  const redirectRes = responseHarness();
  redirectRes.statusCode = 302;
  const redirectMiddleware = capture({ loadOptionsEquityFromSheets: async () => { loadCalls += 100; return curve; } });
  redirectMiddleware(redirectReq, redirectRes, () => {});
  redirectRes.send("<p>Redirecting to /login</p>");
  assert.strictEqual(redirectRes.sent, "<p>Redirecting to /login</p>", "unauthorized dashboard redirect must remain untouched");

  console.log("Options canonical page and Day Trading dashboard separation: PASS");
})().catch(error => { console.error(error); process.exit(1); });
