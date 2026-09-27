"use strict";

const { chromium } = require("playwright");

const EN_ORIGIN = process.env.QA_EN_ORIGIN || "https://www.vixale.com";
const RU_ORIGIN = process.env.QA_RU_ORIGIN || "https://ru.vixale.com";
const FAVICON_VERSION = "20260927";
const EXPECTED_HREFS = [
  `/favicon.ico?v=${FAVICON_VERSION}`,
  `/favicon.png?v=${FAVICON_VERSION}`,
  `/apple-touch-icon.png?v=${FAVICON_VERSION}`,
];
const ROUTES = [
  "/",
  "/trading-systems",
  "/trading-systems/day-trading",
  "/trading-systems/swing-trading",
  "/trading-systems/options",
  "/results",
  "/pricing",
  "/access",
  "/services",
  "/about",
  "/trading-guide",
  "/closed-trades",
  "/risk-management",
];

function sameArray(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function gotoWithRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(attempt * 1500);
    }
  }
  throw lastError;
}

async function faviconHrefs(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("link[rel]"))
    .filter((node) => {
      const tokens = String(node.getAttribute("rel") || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
      return tokens.includes("icon")
        || tokens.includes("apple-touch-icon")
        || tokens.includes("apple-touch-icon-precomposed")
        || tokens.includes("mask-icon");
    })
    .map((node) => node.getAttribute("href") || ""));
}

async function verifyAssets(context, origin, label) {
  for (const [assetPath, expectedType] of [
    [EXPECTED_HREFS[0], "image/x-icon"],
    [EXPECTED_HREFS[1], "image/png"],
    [EXPECTED_HREFS[2], "image/png"],
  ]) {
    const response = await context.request.get(new URL(assetPath, origin).href, { timeout: 30000 });
    if (response.status() !== 200) throw new Error(`${label} ${assetPath}: status ${response.status()}`);
    const type = String(response.headers()["content-type"] || "").toLowerCase();
    if (!type.includes(expectedType)) throw new Error(`${label} ${assetPath}: content-type ${type || "missing"}`);
    const body = await response.body();
    if (!body.length) throw new Error(`${label} ${assetPath}: empty body`);
  }
}

async function verifyOrigin(browser, origin, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await verifyAssets(context, origin, label);
    for (const route of ROUTES) {
      const response = await gotoWithRetry(page, new URL(route, origin).href);
      const status = response ? response.status() : null;
      if (!response || status >= 400) throw new Error(`${label} ${route}: status ${status ?? "no response"}`);
      const hrefs = await faviconHrefs(page);
      if (!sameArray(hrefs, EXPECTED_HREFS)) {
        throw new Error(`${label} ${route}: favicon hrefs differ: ${JSON.stringify(hrefs)}`);
      }
    }
  } finally {
    await context.close();
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyOrigin(browser, EN_ORIGIN, "EN");
    await verifyOrigin(browser, RU_ORIGIN, "RU");
  } finally {
    await browser.close();
  }
  console.log(`Canonical favicon QA PASS: ${ROUTES.length} public routes on EN and RU`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
