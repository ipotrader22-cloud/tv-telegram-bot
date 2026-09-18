"use strict";

const assert = require("assert");
const pkg = require("../package.json");
const {
  SWING_PATH,
  STYLE_ID,
  PAGE_MARKER,
  extractSnapshotRelease,
  refineSwingHtml,
} = require("../website_swing_ui_refinement");

const start = pkg.scripts.start;
assert(start.startsWith("node -r ./website_conversion_final_qa_refinement.js -r ./website_description_card_standard.js -r ./website_conversion_access_services_refinement.js"));
assert(start.includes("-r ./website_swing_ui_refinement.js -r ./website_conversion_pricing_refinement.js"));

const fixture = `<!doctype html><html><head></head><body>
<main data-vx-conversion-system-page="swing">
  <div class="hero-layout">
    <section class="hero"><h1>Follow a portfolio reviewed every day.</h1><p class="hero-copy">A public research/model portfolio built around Vixale's proprietary ranking system. Review open positions, potential candidates, completed trades and model equity history from the latest published update.</p><div class="stamp"><span class="pill">Snapshot 2026-09-18 · 10:15 ET</span></div></section>
    <section class="summary" aria-label="Swing Leaders summary">
      <div class="summary-card posture"><small>Market Posture</small><strong>Constructive but selective: S&amp;P 500 and Nasdaq opened higher as oil eased, while Treasury yields remained elevated; AI/optical infrastructure led early technology strength.</strong></div>
      <div class="summary-card"><small>Active Portfolio</small><strong>4</strong></div>
      <div class="summary-card"><small>Potential Candidates</small><strong>7</strong></div>
      <div class="summary-card"><small>Cash</small><strong>20%</strong></div>
      <div class="summary-card"><small>Model Allocation</small><strong>$10K</strong><span>per position</span></div>
    </section>
  </div>
  <section class="vx-evidence-context" data-vx-evidence-credibility="swing" aria-label="Swing evidence coverage">
    <h2>Swing evidence context</h2><p>Evidence type: Trading Lab research/model portfolio.</p><div><strong>Coverage</strong></div>
  </section>
  <section class="how" aria-label="How Swing Leaders works">
    <h2>How Swing Leaders Works</h2>
    <div class="how-grid"><div class="how-item"><strong>Active Portfolio</strong><p>Old technical wording.</p></div></div>
    <div class="rules">Old rules copy.</div>
  </section>
</main>
<footer class="footer"><div class="wrap">Vixale Swing Leaders · Last Updated 2026-09-18 10:15 ET</div></footer>
</body></html>`;

assert.deepStrictEqual(extractSnapshotRelease(fixture), { date: "2026-09-18", time: "10:15 ET" });

const out = refineSwingHtml(fixture);
assert(out.includes(PAGE_MARKER));
assert(out.includes(`id="${STYLE_ID}"`));
assert(out.includes("font-size:clamp(30px,3.5vw,42px)!important"));
assert(out.includes('[data-vx-conversion-system-page="swing"] .hero .hero-copy{box-sizing:border-box;padding:16px 20px;border:1px solid #d7e8df;border-radius:24px;background:linear-gradient(135deg,#eaf8f0 0%,#f6fbf8 52%,#fff 100%)'));
assert(out.includes(".vx-swing-how-block h2{margin:0 0 18px;font-size:33px"));
assert(out.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
assert(out.includes(".vx-swing-how-list p{box-sizing:border-box;height:100%;margin:0;padding:18px 20px;border:1px solid #d7e8df;border-radius:24px;background:linear-gradient(145deg,#eaf8f0 0%,#f6fbf8 55%,#fff 100%)"));
assert(out.includes("color:#5f6d67;font-size:18px;line-height:1.5"));
assert(out.includes(".vx-swing-market-update h2{margin-bottom:10px;font-size:16.5px!important"));
assert(out.includes(".vx-swing-posture-copy{margin:0;color:#5f6d67;font-size:18px;line-height:1.5"));
assert(out.includes(".vx-swing-posture-copy{font-size:17px}"));
assert(out.includes('[data-vx-conversion-system-page="swing"] .hero .hero-copy{padding:15px 17px;border-radius:21px}'));
assert(out.includes(".vx-swing-how-list p{padding:16px 17px;border-radius:21px;font-size:17px}"));

assert(!out.includes("Swing evidence context"));
assert(!out.includes('data-vx-evidence-credibility="swing"'));
assert(!out.includes("Old technical wording"));
assert(!out.includes("Old rules copy"));

assert(out.includes('data-vx-swing-how="beginner"'));
assert(out.includes("Stocks that are currently in the model portfolio."));
assert(out.includes("They are not open positions and may never be added."));
assert(out.includes("The 5% stop reference is checked during the scheduled morning review, not as an automatic intraday stop."));
assert(out.includes("$10K / position"));
assert(!out.includes("$10K</strong><span>per position"));
assert(out.includes("<small>Candidates</small>"));
assert(out.includes("<strong>Candidates</strong>"));
assert(!out.includes("<small>Potential Candidates</small>"));
assert(!out.includes("<strong>Potential Candidates</strong>"));

assert(out.includes('aria-label="Market Update"'));
assert(out.includes('data-vx-swing-market-update="1"'));
assert(out.includes("<h2>Market Update</h2>"));
assert(!out.includes("<h2>Market Posture</h2>"));
assert(out.includes("Constructive but selective: S&amp;P 500 and Nasdaq opened higher as oil eased"));
assert(out.includes("<strong>Released:</strong> 2026-09-18 · 10:15 ET"));

const howIndex = out.indexOf('data-vx-swing-how="beginner"');
const summaryIndex = out.indexOf('aria-label="Swing Leaders summary"');
const activeMetricIndex = out.indexOf("<small>Active Portfolio</small>");
const movedUpdateIndex = out.indexOf('data-vx-swing-market-update="1"');
const allocationIndex = out.indexOf("$10K / position");
assert(howIndex >= 0 && howIndex < summaryIndex, "How block should sit above the horizontal summary row");
assert(summaryIndex >= 0 && summaryIndex < activeMetricIndex, "Active Portfolio should remain inside the summary row below How");
assert(movedUpdateIndex > allocationIndex, "Market Update should remain below the summary row");

const summaryMatch = out.match(/<section\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*aria-label=["']Swing Leaders summary["'][^>]*>[\s\S]*?<\/section>/i);
assert(summaryMatch, "Swing summary row should remain present");
assert(!summaryMatch[0].includes('data-vx-swing-how="beginner"'), "How block must not occupy a metric-card slot");
assert(!summaryMatch[0].includes("Market Posture"), "Market Posture should not occupy a metric-card slot");
assert(!summaryMatch[0].includes("Market Update"), "Market Update should not occupy a metric-card slot");

const footerOnlyFixture = fixture.replace('<div class="stamp"><span class="pill">Snapshot 2026-09-18 · 10:15 ET</span></div>', "");
assert.deepStrictEqual(extractSnapshotRelease(footerOnlyFixture), { date: "2026-09-18", time: "10:15 ET" });

assert.strictEqual(refineSwingHtml(out), out, "Swing UI refinement must be idempotent");
assert.strictEqual(SWING_PATH, "/trading-systems/swing-trading");

console.log("Swing UI presentation refinement: PASS");
