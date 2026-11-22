"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const { finiteMetric } = require("../public/vixale-results");
const { archivePage } = require("../website_closed_trades_archive");
const { OVERVIEW_PATH, PORTFOLIO_PATH } = require("../lib/website-swing-public");
const { patchAppSource } = require("../website_dashboard_access_security");

const root = path.resolve(__dirname, "..");
const entry = require("../package.json").scripts.start.split(" ").slice(1);
const keyList = ["PATH", "Path", "PATHEXT", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"];
const env = Object.fromEntries(keyList.filter(key => process.env[key]).map(key => [key, process.env[key]]));
const out = process.env.QA_SCREENSHOTS;
const dates = Array.from({ length: 36 }, (_, i) => new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10));
const points = dates.map((date, i) => ({ date, cumulative_pnl: i === 18 ? null : (i - 3) * 133 }));
const sampleTrades = Array.from({ length: 116 }, (_, i) => ({ symbol: i % 2 ? "AAPL" : "MSFT", side: "LONG", result: i % 2 ? 1 : -1 }));

function browserOptions() {
  return process.env.QA_CHROMIUM ? { executablePath: process.env.QA_CHROMIUM } : {};
}

async function proxy(port, host) {
  const server = http.createServer((req, res) => {
    const target = http.request({ hostname: "127.0.0.1", port, method: req.method, path: req.url, headers: { ...req.headers, host } }, from => {
      res.writeHead(from.statusCode, from.headers);
      from.pipe(res);
    });
    target.on("error", () => res.writeHead(502).end());
    req.pipe(target);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, origin: "http://127.0.0.1:" + server.address().port };
}

async function start(dir) {
  const child = spawn(process.execPath, entry, { cwd: root, env: {
    ...env, PORT: "0", WEBHOOK_INBOX_SPOOL_FILE: path.join(dir, "audit-spool.json"),
  }, windowsHide: true });
  let logs = "";
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server startup timeout\n" + logs)), 12000);
    child.stderr.on("data", chunk => { logs += chunk; });
    child.stdout.on("data", chunk => {
      logs += chunk;
      const found = logs.match(/Server running on port (\d+)/);
      if (found) { clearTimeout(timer); resolve(Number(found[1])); }
    });
    child.once("exit", code => { clearTimeout(timer); reject(new Error("Server exited " + code + "\n" + logs)); });
  }).catch(error => { child.kill(); throw error; });
  return { child, port };
}

async function browserCase(browser, site, locale, width, route) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width <= 480, hasTouch: width <= 480 });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], forbidden = [], badAssets = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("response", res => {
    if (new URL(res.url()).pathname.startsWith("/assets/") && !res.ok()) badAssets.push(res.url());
  });
  await context.route("**/*", async r => {
    const url = new URL(r.request().url());
    if (url.origin !== site) return r.abort();
    if (url.pathname === "/api/swing-leaders") { forbidden.push(url.pathname); return r.abort(); }
    const json = {
      "/public-performance.json": { ok: true, summary: { open_count: null, closed_pnl_today: null }, equity_curve: { total_realized_pnl: 0, points } },
      "/public-live-open-pnl.json": { ok: true, open_pnl: null },
      "/public-options-performance.json": { ok: true, equity_curve: { total_realized_pnl: 0, points } },
    };
    if (json[url.pathname]) return r.fulfill({ json: json[url.pathname] });
    if (r.request().method() !== "GET") return r.abort();
    return r.continue();
  });
  const response = await page.goto(site + route, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200, route);
  const header = page.locator("#vx-primary-menu");
  const toggle = page.locator(".vx-public-nav-toggle");
  if (await header.count()) {
    const contrast = await page.locator(".vx-public-nav-cta").evaluate(button => {
      const style = getComputedStyle(button);
      const luminance = color => {
        const [r, g, b] = color.match(/\d+/g).slice(0, 3).map(channel => {
          const n = Number(channel) / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const colors = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
      return (colors[0] + 0.05) / (colors[1] + 0.05);
    });
    assert(contrast >= 4.5, "trial CTA contrast " + contrast + " on " + route);
    if (width <= 1100) {
      await toggle.waitFor({ state: "visible" });
      await header.waitFor({ state: "hidden" });
      await toggle.focus();
      await toggle.press("Enter");
      await header.getByRole("link").first().waitFor();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await header.getByRole("link").first().focus();
      await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
    } else {
      await header.getByRole("link").first().waitFor();
    }
  } else assert.equal(route, "/login", "missing header on " + route);
  if (route === "/") {
    await page.getByRole("tab").nth(0).focus();
    await page.keyboard.press("ArrowRight");
    assert.match(await page.getByRole("tabpanel").innerText(), locale === "ru" ? /модельн/i : /portfolio/i);
    await page.getByRole("tab").nth(0).click();
    assert.equal(await page.locator("iframe[src*='heygen']").count(), 0);
  }
  if (route === "/results") {
    await page.locator("#vx-results-day-chart-summary").waitFor();
    assert.equal(await page.locator("#vx-results-day-open").textContent(), "—");
    assert.equal(await page.locator("#vx-results-day-closed").textContent(), "—");
    assert.equal(await page.locator("#vx-results-day-open-pnl").textContent(), "—");
    assert.match(await page.locator("#vx-results-day-total").textContent(), /0[,.]00/);
    assert.equal(await page.locator("#vx-results-day-chart polyline").count(), 2);
    const ticks = await page.locator("#vx-results-day-chart [data-date-tick]").evaluateAll(labels => labels.map(e => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, height: r.height };
    }));
    assert(ticks.length >= 2);
    ticks.slice(1).forEach((label, index) => assert(label.left >= ticks[index].right, "colliding axis ticks"));
    assert(ticks.every(label => label.height >= 11));
    assert.equal(await page.locator("article[role=link]").count(), 0);
  }
  if (route === "/access") {
    const form = page.locator('form[action="/password-request"]');
    assert.equal(await form.locator("input[type=email]").count(), 1);
    assert(await form.locator('button[type="submit"]').evaluate(button => button.scrollWidth <= button.clientWidth + 1));
    if (locale === "ru") assert.match(await page.locator("h1").innerText(), /Запросите доступ/);
  }
  const details = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    h1: [...document.querySelectorAll("h1")].filter(e => e.getClientRects().length).length,
    alternates: [...document.querySelectorAll("link[hreflang]")].map(e => e.hreflang),
    overflow: [...document.querySelectorAll("body *")].flatMap(e => {
      if (!e.getClientRects().length || e.closest("svg, .vx-closed-table-scroll")) return [];
      const range = document.createRange();
      range.selectNodeContents(e);
      const right = range.getBoundingClientRect().right;
      return right > document.documentElement.clientWidth + 2 ? [[e.tagName, String(e.className).slice(0, 75), Math.round(right)]] : [];
    }).slice(0, 20),
  }));
  assert.equal(details.lang, locale);
  assert(details.scroll <= details.width + 1, JSON.stringify({ locale, route, width, ...details }));
  assert.equal(details.h1, 1, locale + " " + route);
  if (route !== "/login") {
    assert.deepEqual(details.alternates, ["en", "ru", "x-default"], route);
    const otherHost = locale === "ru" ? "www.vixale.com" : "ru.vixale.com";
    assert.equal(await page.locator(".vx-public-language").getAttribute("href"), "https://" + otherHost + route);
  }
  assert.deepEqual(forbidden, [], "anonymous page requested protected Swing data");
  assert.deepEqual(errors, []);
  assert.deepEqual(badAssets, []);
  if (out) await page.screenshot({ path: path.join(out, locale + "-" + width + "-" + (route.split("/").filter(Boolean).pop() || "home") + ".png") });
  await context.close();
}

async function main() {
  for (const v of [null, undefined, "", "  ", false, {}, NaN, Infinity, "bad"]) assert.equal(finiteMetric(v), null);
  for (const v of [0, "0"]) assert.equal(finiteMetric(v), 0);
  assert.equal(finiteMetric("-12.5"), -12.5);
  assert.equal(archivePage(sampleTrades).rows.length, 50);
  const filtered = archivePage(sampleTrades, {q: "aapl", outcome: "win", page: "2"});
  assert.equal(filtered.rows.length, 8);
  assert.equal(filtered.total, 58);
  assert.equal(archivePage(sampleTrades, {q: "none"}).total, 0);
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(patchAppSource(appSource.replace(/\n/g, "\r\n")), patchAppSource(appSource));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vixale-public-qa-"));
  let app, browser;
  const proxies = [];
  try {
    app = await start(dir);
    if (out) fs.mkdirSync(out, { recursive: true });
    browser = await chromium.launch(browserOptions());
    for (const [host, locale] of [["www.vixale.com", "en"], ["ru.vixale.com", "ru"]]) {
      const p = await proxy(app.port, host);
      proxies.push(p.server);
      const denied = await fetch(p.origin + "/api/swing-leaders");
      assert.equal(denied.status, 401);
      const route = await fetch(p.origin + PORTFOLIO_PATH, { redirect: "manual" });
      assert.equal(route.status, 302);
      const alternate = await fetch(p.origin + "/daily-recaps", { redirect: "manual" });
      assert.equal(alternate.status, 301);
      for (const [width, list] of [
        [320, ["/", "/services", "/pricing", "/access", "/trading-guide", "/results"]],
        [390, ["/", "/results", OVERVIEW_PATH, "/login", "/closed-trades",
          "/trading-systems", "/trading-systems/day-trading", "/trading-systems/options", "/risk-management", "/about"]],
        [768, ["/"]], [1024, ["/"]], [1440, ["/", "/services", "/results", OVERVIEW_PATH]],
      ]) {
        for (const pathname of list) await browserCase(browser, p.origin, locale, width, pathname);
      }
    }
    console.log("Public website checks passed for both locales, including keyboard, reflow, chart data, and access boundaries.");
  } finally {
    if (browser) await browser.close();
    for (const server of proxies) server.close();
    if (app) app.child.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
