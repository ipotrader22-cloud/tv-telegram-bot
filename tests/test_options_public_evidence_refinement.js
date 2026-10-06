"use strict";

const assert = require("assert");
const mod = require("../website_options_public_evidence_refinement");

const values = [
  ["ID", "Trade Date", "Entry Time", "Symbol", "Strategy", "Legs", "Expiration", "Contracts", "Multiplier", "Trade Type", "Entry Price", "Exit Date", "Exit Time", "Exit Price", "Fees", "Status", "Notes", "Created At", "Updated At"],
  ["OPT-1", "2026-09-27", "10:00", "SPX", "Calendar", "Short 7680 / Long 7680", "2026-09-29", 10, 100, "Debit", 20.70, "2026-09-29", "14:00", 24.00, 102.42, "Closed", "Calendar entry"],
  ["OPT-2", "2026-09-29", "11:15", "ES", "Straddle", "Short 6000C / 6000P", "2026-09-29", 2, 50, "Credit", 40, "", "", "", 0, "Open", "Straddle entry"],
  ["OPT-3", "2026-09-30", "09:45", "SPX", "Debit spread", "Long 7700 / Short 7710", "2026-09-30", 1, 100, "Debit", 5, "2026-09-30", "15:10", 7, 0, "Closed"],
];

const evidence = mod.buildPublicOptionsEvidence(values);
assert.equal(evidence.trades.length, 3);
assert.equal(evidence.curve.points.length, 2);
assert.equal(evidence.curve.points[0].date, "2026-09-29");
assert.equal(evidence.curve.points[0].cumulative_pnl, 3197.58);
assert.equal(evidence.curve.points[1].cumulative_pnl, 3397.58);

const salesHtml = `<!doctype html><html><head></head><body>
<div class="vx-options-sales" data-vx-options-sales-page="1">
<section class="vx-options-hero"><div class="vx-options-actions"><a class="primary" href="https://t.me/example" target="_blank" rel="noopener noreferrer">Request Options Access</a></div></section>
<section class="vx-options-preview-section" id="options-dashboard-preview"><div class="vx-options-section-copy"><p>This is a real historical example from the existing Options dashboard, using actual journal fields and trade dates. Current open positions are not exposed in this public preview.</p></div><div class="vx-options-dashboard-shot" id="options-preview-card"><div>ACTUAL OPTIONS DASHBOARD EXAMPLE</div><div><div>nested</div></div></div></section>
<section class="vx-options-benefits"><div class="vx-options-benefit-grid"><article><span>01</span><h3>See new positions</h3><p>One</p></article><article><span>02</span><h3>Follow daily updates</h3><p>Two</p></article><article><span>03</span><h3>Review completed trades</h3><p>Three</p></article></div></section>
<section class="vx-options-results"><div><h2>The results are part of the service.</h2><p>Your subscription includes access to our closed-trade history and available brokerage screenshots, so you can look beyond the latest update and review the trading record.</p><strong>Open positions. Closed trades. Recorded results.</strong></div></section>
<section class="vx-options-subscription"><a class="vx-options-request" href="https://t.me/example" target="_blank" rel="noopener noreferrer">Request Options Access</a><small>Paid onboarding is currently handled manually through Vixale on Telegram. The button opens a pre-filled plan request; activation, payment, and access details are confirmed during onboarding.</small></section>
<section class="vx-options-faq"><p>In the options dashboard on our website.</p><p>Yes. Subscribers can access the closed-trade history and available supporting brokerage screenshots.</p></section>
</div></body></html>`;

const refined = mod.refinePublicOptionsPage(salesHtml, evidence, "en", false);
assert(refined.includes(mod.PAGE_MARKER));
assert.equal((refined.match(/href="\/#password-access"/g) || []).length, 5, "two Options CTAs + three benefit cards should point to registration");
assert(!refined.includes("https://t.me/example"));
assert(refined.includes("Real trades. Daily updates. A record you can check."));
assert(refined.includes('href="#option-journal-public">proofs</a>'));
assert(refined.includes("The full Option Journal is published below"));
assert(!refined.includes("Current open positions are not exposed"));
assert(refined.includes('id="options-public-chart"'));
assert(refined.includes(".vx-options-public-chart-svg text{fill:#64776c;font-size:9px;font-family:inherit}"), "chart axis/date labels should remain visually compact beside the Total Realized value");
assert(refined.includes('id="option-journal-public"'));
assert(refined.indexOf('id="options-public-chart"') < refined.indexOf('id="options-preview-card"'), "chart must be above dashboard example");
assert(refined.indexOf('id="option-journal-public"') > refined.indexOf('id="options-dashboard-preview"'), "journal must follow preview section");
assert(refined.includes("SPX"));
assert(refined.includes("ES"));
assert(!refined.includes("/dashboard/options/OPT-1/proofs/1"), "protected proof URL must not be exposed");
assert(!refined.includes("/dashboard/options/OPT-2/proofs/1"), "protected proof URL must not be exposed");
assert(refined.includes("Start with Vixale viewer access"));
assert(refined.includes("On this Options page in the public Option Journal."));
assert(refined.includes("The public Option Journal shows completed trades and recorded P/L"));

const unavailable = mod.refinePublicOptionsPage(salesHtml, { trades: [], curve: { points: [], total_realized_pnl: 0 } }, "en", true);
assert(unavailable.includes("Options performance history is temporarily unavailable."));
assert(unavailable.includes("The Option Journal is temporarily unavailable. No simulated data is substituted."));
assert(unavailable.includes('Total realized</span><b class="">—</b>'), "error state must not invent a $0 total");

const homeHtml = `<html><body><h3>Position details and supporting records are protected.</h3><p>Openings, updates and closures are published through the existing Options workflow. Public visitors see the product overview; entitled viewers can open the protected position history and brokerage records.</p></body></html>`;
const homeRefined = mod.refineHomeOptionsEvidenceCopy(homeHtml);
assert(homeRefined.includes("Options chart and trade journal are public."));
assert(homeRefined.includes("brokerage proof files remain protected for approved viewers."));
assert(!homeRefined.includes("entitled viewers can open the protected position history"));
const homeRu = mod.refineHomeOptionsEvidenceCopy(homeHtml, "ru");
assert(homeRu.includes("График и журнал Options открыты для просмотра."));
assert(homeRu.includes("файлы брокерских подтверждений остаются защищёнными"));

// Actual admin schema: journal Q:S are Notes/Created At/Updated At;
// proof metadata is a separate sheet, and only validated proxy IDs may leave the server.
const tradeId = "11111111-1111-4111-8111-111111111111";
const proof1 = "22222222-2222-4222-8222-222222222222";
const proof2 = "33333333-3333-4333-8333-333333333333";
const realRow = [...values[1]];
realRow[0] = tradeId;
realRow[16] = 'Owner note <script>alert("x")</script> & details';
const proofRows = [[proof1, tradeId, "private-storage-key", "private-name.jpg"], [proof2, tradeId, "internal-path", "private-name-2.jpg"]];
const withProofs = mod.buildPublicOptionsEvidence([realRow], proofRows);
assert.deepStrictEqual(withProofs.trades[0].proof_ids, [proof1, proof2]);
assert(!JSON.stringify(withProofs).includes("private-storage-key"));
for (const locale of ["en", "ru"]) {
  const journal = mod.renderPublicJournal(withProofs, locale);
  assert(journal.includes(locale === "en" ? ">Proofs</th>" : ">Подтверждения</th>"));
  assert(journal.includes(locale === "en" ? ">View Proofs</summary>" : ">Подтверждения</summary>"));
  assert(journal.includes(`/dashboard/options/${tradeId}/proofs/${proof1}`));
  assert(journal.includes(locale === "en" ? '>P&L</th><th scope="col">Notes</th><th scope="col">Proofs</th>' : '>P&L</th><th scope="col">Примечания</th><th scope="col">Подтверждения</th>'));
  assert(journal.includes('Owner note &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; details'));
  assert(!journal.includes('<script>alert("x")</script>'));
  for (const forbidden of ["Add Proof", "Delete", "Edit", "private-storage-key", "internal-path", "private-name", "/admin/"]) assert(!journal.includes(forbidden), forbidden);
}
assert(mod.renderPublicJournal(mod.buildPublicOptionsEvidence([realRow], [proofRows[0]])).includes(">View Proof</a>"));
assert(!mod.renderPublicJournal(mod.buildPublicOptionsEvidence([realRow])).includes("/proofs/"));
assert(!mod.renderPublicJournal(mod.buildPublicOptionsEvidence([realRow], [["javascript:alert(1)", tradeId, "key"]])).includes("javascript:"));
const many = mod.buildPublicOptionsEvidence(Array.from({ length: 12 }, (_, i) => {
  const row = [...realRow]; row[1] = `2026-09-${String(i + 1).padStart(2, "0")}`; return row;
}));
const manyHtml = mod.renderPublicJournal(many);
const rows = manyHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1].match(/<tr[^>]*>/g);
assert.equal(rows.length, 12);
assert.equal(rows.filter(row => !row.includes("hidden")).length, 8);
assert(manyHtml.indexOf("2026-09-12") < manyHtml.indexOf("2026-09-01"));
assert(manyHtml.includes("Show more trades"));
const vm = require("vm");
let click;
const olderRows = Array.from({ length: 4 }, () => ({ hidden: true }));
const button = { expanded: "false", dataset: { more: "Show more trades", less: "Show less" }, getAttribute() { return this.expanded; }, setAttribute(name, value) { this.expanded = value; }, addEventListener(name, fn) { click = fn; } };
vm.runInNewContext(`(${mod.journalToggleScript.toString()})();`, { document: { getElementById: () => button, querySelectorAll: () => olderRows } });
click(); assert(olderRows.every(row => !row.hidden)); assert.equal(button.textContent, "Show less");
click(); assert(olderRows.every(row => row.hidden)); assert.equal(button.textContent, "Show more trades");
for (const amounts of [[0], [-2000, -4000], [2000, 6000], [-2000, 4000], [0.1, 0.2]]) {
  const chart = mod.renderCompactChart({ curve: { points: amounts.map((value, i) => ({ date: `2026-09-${20 + i}`, cumulative_pnl: value })) } });
  assert(chart.includes('class="vx-options-x-tick"'));
  assert(chart.includes('class="vx-options-y-tick"'));
  assert(chart.includes("$0"));
  assert((chart.match(/stroke-dasharray="4 4"/g) || []).length >= 3);
  assert.equal((chart.match(/<circle /g) || []).length, amounts.length, "every plotted equity point should have a circular marker");
  assert(!chart.includes("NaN"));
}
const densePoints = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, cumulative_pnl: (i + 1) * 100 }));
const denseChart = mod.renderCompactChart({ curve: { points: densePoints, total_realized_pnl: 3000 } });
assert.equal((denseChart.match(/<circle /g) || []).length, densePoints.length, "point markers must remain visible when the curve has more than 24 daily points");
assert.equal(mod.optionPnl({ ...evidence.trades[0], trade_type: "Credit", entry_price: 24, exit_price: 20.70 }), 3197.58);
assert.equal(mod.optionPnl(evidence.trades[1]), null);
const sameDay = mod.buildOptionsEquityCurve([evidence.trades[0], evidence.trades[0], evidence.trades[1]]);
assert.deepStrictEqual(sameDay.points, [{ date: "2026-09-29", daily_pnl: 6395.16, cumulative_pnl: 6395.16 }]);
console.log("options public evidence refinement: ok");

(async () => {
  const source = require("fs").readFileSync(require.resolve("../website_options_public_evidence_refinement"), "utf8");
  for (const failProofs of [false, true]) {
    const reads = [];
    const sandbox = { module: { exports: {} }, process: { env: { GOOGLE_SHEET_ID: "fixture", GOOGLE_SERVICE_ACCOUNT_JSON: "{}" } }, console,
      require(name) {
        if (name === "module") return { _load() {} };
        assert.equal(name, "googleapis");
        return { google: { auth: { GoogleAuth: class { constructor(options) { assert.deepStrictEqual(Array.from(options.scopes), ["https://www.googleapis.com/auth/spreadsheets.readonly"]); } } },
          sheets: () => ({ spreadsheets: { values: { async get({ range }) {
            reads.push(range);
            if (range === mod.OPTION_JOURNAL_RANGE) return { data: { values: [realRow] } };
            assert.equal(range, mod.OPTION_PROOFS_RANGE);
            if (failProofs) throw new Error("unavailable private details");
            return { data: { values: proofRows } };
          } } } }) } };
      } };
    vm.runInNewContext(source, sandbox);
    const loaded = await sandbox.module.exports.loadPublicOptionsEvidenceFromSheets();
    assert.deepStrictEqual(reads, [mod.OPTION_JOURNAL_RANGE, mod.OPTION_PROOFS_RANGE]);
    assert.equal(loaded.trades.length, 1);
    assert.equal(loaded.proof_error, failProofs);
    assert.equal(loaded.trades[0].proof_ids.length, failProofs ? 0 : 2);
    assert(!JSON.stringify(loaded).includes("private"));
  }
  console.log("options read-only proof source and failure isolation: ok");
})().catch(error => { console.error(error); process.exitCode = 1; });
