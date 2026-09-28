"use strict";

// Offline presentation QA: fixtures never reach Sheets, brokers, or the live app.
const assert = require("assert");
const { chromium } = require("playwright");
const { renderSwingLeadersHtml } = require("../lib/swing-leaders");
const { refineCanonicalSwingHtml } = require("../website_swing_canonical_refinement");
const { enhanceActivePortfolioTable } = require("../website_swing_active_model_pnl");
const { refineSwingActivePortfolioRules } = require("../website_swing_active_portfolio_rules_refinement");
const { refineSwingHtml } = require("../website_swing_ui_refinement");
const { localizeRussianHtml } = require("../website_russian_localization");

const snapshot = {
  snapshot_date: "2026-09-27", snapshot_time_et: "16:00 ET",
  market_posture: "QA fixture", cash_pct: "80%", quote_source: "GOOGLEFINANCE",
  quote_delay_notice: "Quotes may be delayed.", research_disclaimer: "Research/model portfolio only.",
  active_count: 2, intern_count: 0, interns: [], closed_trades: [],
  active_portfolio: [
    { ticker: "AMD", entry_price: "$607.00", current_price: "$610.00" },
    { ticker: "TEST", entry_price: "$1,234.56", current_price: "$1,200.00" },
  ].map(item => ({ ...item, exchange: "NASDAQ", score: "87", entry_date: "2026-09-25",
    return_pct: "0.00%", last_review_date: "2026-09-27", brief_note: "Offline presentation fixture." })),
};

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const locale of ["en", "ru"]) {
      for (const width of [1440, 1024, 768, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        let html = refineCanonicalSwingHtml(renderSwingLeadersHtml(snapshot));
        html = refineSwingActivePortfolioRules(html, locale);
        html = refineSwingHtml(enhanceActivePortfolioTable(html));
        if (locale === "ru") html = localizeRussianHtml(html, "/trading-systems/swing-trading");
        await page.route("**/*", route => {
          if (route.request().url().endsWith("/api/swing-leaders")) {
            return route.fulfill({ json: { ...snapshot,
              active_portfolio: snapshot.active_portfolio.map(item => ({ ...item, current_price: "$620.00", return_pct: "2.14%" })),
              active_unrealized_model_pnl: 428, closed_realized_model_pnl: 0 } });
          }
          return route.fulfill({ contentType: "text/html", body: html });
        });
        await page.goto("http://swing-qa.test/trading-systems/swing-trading");
        const section = page.locator("section.section").filter({ has: page.locator("#active-portfolio") });
        await section.locator('td[data-label="Current"]').first().filter({ hasText: "$620.00" }).waitFor();
        const rows = section.locator("tbody tr");
        assert.deepStrictEqual(await rows.first().locator("td").evaluateAll(cells => cells.map(cell => cell.dataset.label)),
          ["Ticker", "Score", "Entry", "Current", "Quantity", "TP", "SL", "P&L, $", "Return", "Research Note"]);
        assert.deepStrictEqual(await section.locator('td[data-label="TP"]').allTextContents(), ["$667.70", "$1,358.02"]);
        assert.deepStrictEqual(await section.locator('td[data-label="SL"]').allTextContents(), ["$576.65", "$1,172.83"]);
        assert.strictEqual(await section.locator(".vx-swing-portfolio-rules").count(), 1);
        assert((await section.locator(".vx-swing-portfolio-rules").innerText()).includes(locale === "ru" ? "дневному закрытию" : "daily close only"));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: page overflow`);
        assert.strictEqual(await section.locator("thead").isVisible(), width > 720);
        if (width <= 720) {
          assert.strictEqual(await section.locator('td[data-label="TP"]').first().evaluate(cell => getComputedStyle(cell, "::before").content), '"TP"');
        }
        assert.deepStrictEqual(errors, []);
        if (process.env.QA_SCREENSHOT_DIR && [1440, 390].includes(width)) {
          await section.screenshot({ path: `${process.env.QA_SCREENSHOT_DIR}/swing-${locale}-${width}.png` });
        }
        console.log(`PASS ${locale} ${width}px: TP/SL, rules, quote refresh, responsive layout`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
