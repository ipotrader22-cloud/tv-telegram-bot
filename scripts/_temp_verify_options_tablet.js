"use strict";

const { chromium } = require("playwright");

const origins = [
  ["EN", "https://www.vixale.com", "Follow our options trades, from entry to exit."],
  ["RU", "https://ru.vixale.com", "Следите за нашими опционными сделками от входа до выхода."],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [locale, origin, hero] of origins) {
      const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
      const page = await context.newPage();
      const response = await page.goto(`${origin}/trading-systems/options`, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!response || response.status() >= 400) throw new Error(`${locale} status ${response && response.status()}`);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const snapshot = await page.evaluate(() => ({
        text: document.body ? document.body.innerText.replace(/\s+/g, " ").trim() : "",
        sales: Boolean(document.querySelector('[data-vx-options-sales-page="1"]')),
        preview: Boolean(document.querySelector('#options-preview-card.vx-options-dashboard-shot')),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        family: Array.from(document.querySelectorAll(".vx-options-family-nav a")).map((node) => node.getAttribute("href") || ""),
      }));
      if (!snapshot.sales) throw new Error(`${locale} sales-page marker missing`);
      if (!snapshot.preview) throw new Error(`${locale} actual historical preview missing`);
      if (!snapshot.text.includes(hero)) throw new Error(`${locale} hero missing`);
      if (snapshot.overflow) throw new Error(`${locale} horizontal overflow at tablet width`);
      const expected = ["/trading-systems/day-trading", "/trading-systems/swing-trading", "/trading-systems/options"];
      if (JSON.stringify(snapshot.family) !== JSON.stringify(expected)) throw new Error(`${locale} family nav mismatch: ${JSON.stringify(snapshot.family)}`);
      console.log(`${locale} Options tablet 820x1180: PASS`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
