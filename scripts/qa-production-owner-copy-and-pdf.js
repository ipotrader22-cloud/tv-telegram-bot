"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { chromium } = require("playwright");

const EN_ORIGIN = String(process.env.QA_EN_ORIGIN || "https://www.vixale.com").replace(/\/$/, "");
const RU_ORIGIN = String(process.env.QA_RU_ORIGIN || "https://ru.vixale.com").replace(/\/$/, "");
const EXPECTED_PDF_SHA256 = "bb51f6ca9baaec0bf10d200f8f308b765ec18ebe1db54ac991c9316bc6fa2c9f";

async function open(page, url) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  assert(response, `no response for ${url}`);
  assert(response.status() < 400, `${url} returned ${response.status()}`);
  await page.waitForTimeout(500);
}

async function verifySwing(page, origin, isRu) {
  const url = `${origin}/trading-systems/swing-trading`;
  await open(page, url);
  const hero = await page.locator(".hero-copy").first().innerText();
  if (isRu) {
    assert(hero.includes("Активный портфель на основе фирменной системы ранжирования Vixale."), "RU Swing owner copy line 1 missing");
    assert(hero.includes("Позиции добавляются и закрываются ежедневно. Обновляется каждое утро около 10:00."), "RU Swing owner copy line 2 missing");
    assert(hero.includes("См. руководство по торговле."), "RU Swing trading-guide sentence missing");
    const href = await page.locator(".vx-swing-guide-link").first().getAttribute("href");
    assert.strictEqual(href, `${RU_ORIGIN}/trading-guide#swing-trading`, "RU Swing guide link must stay on RU host");
  } else {
    assert(hero.includes("Active Portfolio based on Vixale's proprietary ranking system."), "EN Swing owner copy line 1 missing");
    assert(hero.includes("Positions are added and closed daily. Updated every morning around 10:00 am."), "EN Swing owner copy line 2 missing");
    assert(hero.includes("Refer to the trading guide."), "EN Swing trading-guide sentence missing");
    const href = await page.locator(".vx-swing-guide-link").first().getAttribute("href");
    assert.strictEqual(href, `${EN_ORIGIN}/trading-guide#swing-trading`, "EN Swing guide link mismatch");
  }
}

async function verifyHomeLabel(page, origin, isRu) {
  await open(page, `${origin}/`);
  const bodyText = await page.locator("body").innerText();
  const expected = isRu ? "P&L закрытых сделок" : "Closed Trades P&L";
  assert(bodyText.includes(expected), `${isRu ? "RU" : "EN"} home must show ${expected}`);
  assert(!bodyText.includes("P&amp;L"), `${isRu ? "RU" : "EN"} home must not expose escaped ampersand text`);
  assert(!bodyText.includes("Closed Trades ledger"), `${isRu ? "RU" : "EN"} home must not retain old Closed Trades ledger label`);
}

async function verifyPdf(request, origin) {
  const url = `${origin}/download/trading-guide.pdf`;
  const response = await request.get(url, { timeout: 60000 });
  assert.strictEqual(response.status(), 200, `${url} must return 200`);
  const contentType = String(response.headers()["content-type"] || "").toLowerCase();
  assert(contentType.includes("application/pdf"), `${url} must return application/pdf`);
  const pdf = Buffer.from(await response.body());
  assert(pdf.length > 5000, `${url} PDF is unexpectedly small`);
  assert.strictEqual(pdf.subarray(0, 5).toString("ascii"), "%PDF-", `${url} missing PDF signature`);
  assert(pdf.subarray(Math.max(0, pdf.length - 256)).toString("latin1").includes("%%EOF"), `${url} missing PDF EOF marker`);
  assert(pdf.toString("latin1").includes("/Count 5"), `${url} should contain five pages`);
  const digest = crypto.createHash("sha256").update(pdf).digest("hex");
  assert.strictEqual(digest, EXPECTED_PDF_SHA256, `${url} does not match the verified Trading Guide PDF`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await verifySwing(page, EN_ORIGIN, false);
    await verifySwing(page, RU_ORIGIN, true);
    await verifyHomeLabel(page, EN_ORIGIN, false);
    await verifyHomeLabel(page, RU_ORIGIN, true);
    await verifyPdf(context.request, EN_ORIGIN);
    await verifyPdf(context.request, RU_ORIGIN);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log("Owner-requested live copy/link/PDF production QA: PASS");
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
