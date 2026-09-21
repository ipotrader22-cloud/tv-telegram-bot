"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const EN_ORIGIN = process.env.QA_EN_ORIGIN || "https://www.vixale.com";
const RU_ORIGIN = process.env.QA_RU_ORIGIN || "https://ru.vixale.com";
const OUTPUT_DIR = process.env.QA_OUTPUT_DIR || "artifacts/production-locale-qa";

const ROUTES = [
  {
    path: "/",
    requiredRu: ["Торговые сигналы. Три системы. Выбор за вами."],
    forbiddenRu: ["Trading signals. Three systems. Your choice.", "Live Trade Dashboard"],
  },
  { path: "/trading-systems" },
  {
    path: "/trading-systems/day-trading",
    requiredRu: ["Сигналы по акциям и P&L в реальном времени."],
    forbiddenRu: ["Live stock signals and P&L.", "Follow entries, exits, targets, stop levels"],
  },
  { path: "/trading-systems/swing-trading" },
  {
    path: "/trading-systems/options",
    requiredRu: ["Следите за позициями от открытия до закрытия."],
    forbiddenRu: ["Follow positions from open to close."],
  },
  {
    path: "/results",
    requiredRu: ["Результаты торговли по каждой системе."],
    forbiddenRu: ["Trading results, by system."],
  },
  {
    path: "/pricing",
    requiredRu: ["Выберите одну систему или следите за всеми тремя."],
    forbiddenRu: ["Choose one system or follow all three."],
  },
  { path: "/access" },
  { path: "/services" },
  { path: "/about" },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function routeSlug(routePath) {
  if (routePath === "/") return "home";
  return routePath.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function gotoWithRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(attempt * 2500);
    }
  }
  throw lastError;
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .map((node) => node.href)
      .sort();
    const directMainChildren = main
      ? Array.from(main.children).map((node) => {
          const classes = Array.from(node.classList || []).sort().join(".");
          const id = node.id ? `#${node.id}` : "";
          return `${node.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ""}`;
        })
      : [];
    return {
      lang: document.documentElement.getAttribute("lang") || "",
      runtimeLocalized: document.documentElement.getAttribute("data-vx-ru-runtime-localized") || "",
      text: document.body ? document.body.innerText : "",
      hasMain: Boolean(main),
      directMainChildren,
      styleSheets,
      title: document.title,
    };
  });
}

function addFailure(report, detail) {
  report.failures.push(detail);
}

function sameArray(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function run() {
  ensureDir(OUTPUT_DIR);
  const screenshotsDir = path.join(OUTPUT_DIR, "screenshots");
  ensureDir(screenshotsDir);

  const report = {
    generatedAt: new Date().toISOString(),
    origins: { en: EN_ORIGIN, ru: RU_ORIGIN },
    routes: [],
    failures: [],
  };

  const browser = await chromium.launch({ headless: true });
  try {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      const enContext = await browser.newContext({ viewport, locale: "en-US" });
      const ruContext = await browser.newContext({ viewport, locale: "ru-RU" });
      const enPage = await enContext.newPage();
      const ruPage = await ruContext.newPage();

      const enPageErrors = [];
      const ruPageErrors = [];
      enPage.on("pageerror", (error) => enPageErrors.push(String(error)));
      ruPage.on("pageerror", (error) => ruPageErrors.push(String(error)));

      for (const route of ROUTES) {
        const slug = routeSlug(route.path);
        const record = { path: route.path, viewport: viewportName };
        try {
          const [enResponse, ruResponse] = await Promise.all([
            gotoWithRetry(enPage, new URL(route.path, EN_ORIGIN).href),
            gotoWithRetry(ruPage, new URL(route.path, RU_ORIGIN).href),
          ]);

          record.enStatus = enResponse ? enResponse.status() : null;
          record.ruStatus = ruResponse ? ruResponse.status() : null;

          if (!enResponse || enResponse.status() >= 400) {
            addFailure(report, `${viewportName} ${route.path}: EN status ${record.enStatus ?? "no response"}`);
          }
          if (!ruResponse || ruResponse.status() >= 400) {
            addFailure(report, `${viewportName} ${route.path}: RU status ${record.ruStatus ?? "no response"}`);
          }

          const [en, ru] = await Promise.all([pageSnapshot(enPage), pageSnapshot(ruPage)]);
          record.en = {
            lang: en.lang,
            title: en.title,
            directMainChildren: en.directMainChildren,
            styleSheets: en.styleSheets,
          };
          record.ru = {
            lang: ru.lang,
            title: ru.title,
            runtimeLocalized: ru.runtimeLocalized,
            directMainChildren: ru.directMainChildren,
            styleSheets: ru.styleSheets,
          };

          if (!/^ru(?:-|$)/i.test(ru.lang)) {
            addFailure(report, `${viewportName} ${route.path}: RU html lang is ${JSON.stringify(ru.lang)}`);
          }
          if (ru.runtimeLocalized !== "1") {
            addFailure(report, `${viewportName} ${route.path}: RU runtime localizer marker is missing`);
          }
          if (en.hasMain !== ru.hasMain) {
            addFailure(report, `${viewportName} ${route.path}: EN/RU main presence differs`);
          }
          if (!sameArray(en.directMainChildren, ru.directMainChildren)) {
            addFailure(report, `${viewportName} ${route.path}: EN/RU top-level main structure differs`);
          }
          if (!sameArray(en.styleSheets, ru.styleSheets)) {
            addFailure(report, `${viewportName} ${route.path}: EN/RU stylesheet URLs differ`);
          }

          if (viewportName === "desktop") {
            const ruText = normalizeText(ru.text);
            for (const phrase of route.requiredRu || []) {
              if (!ruText.includes(normalizeText(phrase))) {
                addFailure(report, `desktop ${route.path}: required RU text missing: ${phrase}`);
              }
            }
            for (const phrase of route.forbiddenRu || []) {
              if (ruText.includes(normalizeText(phrase))) {
                addFailure(report, `desktop ${route.path}: residual English/legacy text present: ${phrase}`);
              }
            }
          }

          await Promise.all([
            enPage.screenshot({ path: path.join(screenshotsDir, `${viewportName}-${slug}-en.png`), fullPage: true }),
            ruPage.screenshot({ path: path.join(screenshotsDir, `${viewportName}-${slug}-ru.png`), fullPage: true }),
          ]);
        } catch (error) {
          record.error = String(error && error.stack ? error.stack : error);
          addFailure(report, `${viewportName} ${route.path}: browser QA exception: ${String(error)}`);
        }
        report.routes.push(record);
      }

      report[`${viewportName}PageErrors`] = { en: enPageErrors, ru: ruPageErrors };
      await enContext.close();
      await ruContext.close();
    }
  } finally {
    await browser.close();
  }

  const summary = [
    "# Vixale EN/RU production browser QA",
    "",
    `Generated: ${report.generatedAt}`,
    `Routes checked: ${ROUTES.length}`,
    `Viewports: ${Object.keys(VIEWPORTS).join(", ")}`,
    `Failures: ${report.failures.length}`,
    "",
  ];

  if (report.failures.length) {
    summary.push("## Failures", "", ...report.failures.map((item) => `- ${item}`), "");
  } else {
    summary.push("## Result", "", "PASS — all configured production EN/RU checks passed.", "");
  }

  summary.push(
    "## Notes",
    "",
    "- Screenshots are paired EN/RU artifacts for manual visual review; text length may legitimately change layout details such as wrapping.",
    "- Automated parity compares top-level `<main>` structure and stylesheet URLs, not pixel identity.",
    "- Strict translation assertions target known production regressions on Home, Day Trading, Options, Results, and Pricing.",
    ""
  );

  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.md"), `${summary.join("\n")}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
  }

  if (report.failures.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
