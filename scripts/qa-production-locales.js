"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const offer = require("../lib/website-commercial-offer");

const EN_ORIGIN = process.env.QA_EN_ORIGIN || "https://www.vixale.com";
const RU_ORIGIN = process.env.QA_RU_ORIGIN || "https://ru.vixale.com";
const OUTPUT_DIR = process.env.QA_OUTPUT_DIR || "artifacts/production-locale-qa";

const EXPECTED_NAV_HREFS = [
  "/trading-systems/day-trading",
  "/trading-systems/swing-trading",
  "/trading-systems/options",
  "/results",
  "/daily-trading-summary",
  "/pricing",
];
const EXPECTED_EN_NAV = ["Day Trading", "Swing Trading", "Options", "Results", "Daily Recaps", "Pricing"];
const EXPECTED_RU_NAV = ["Дейтрейдинг", "Свинг-трейдинг", "Опционы", "Результаты", "Ежедневные итоги", "Тарифы"];
const EXPECTED_EN_ACTIONS = ["Log In", "Get 30 Days Free"];
const EXPECTED_RU_ACTIONS = ["Войти", "30 дней бесплатно"];
const EXPECTED_ACTION_HREFS = [offer.LOGIN_URL, offer.DAY_TRIAL_URL];

const ROUTES = [
  {
    path: "/",
    requiredRu: ["Торговые сигналы. Три системы. Выбор за вами.", "30 дней бесплатно", "Посмотреть результаты", "Запросить бесплатный viewer-доступ"],
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
    requiredRu: ["Следите за нашими опционными сделками от входа до выхода."],
    forbiddenRu: ["Follow our options trades, from entry to exit.", "Follow positions from open to close."],
  },
  {
    path: "/results",
    requiredRu: ["Результаты торговли по каждой системе."],
    forbiddenRu: ["Trading results, by system."],
  },
  {
    path: "/pricing",
    requiredRu: ["Выберите одну систему или все три."],
    forbiddenRu: ["Choose one system or follow all three."],
  },
  { path: "/access" },
  {
    path: "/services",
    requiredRu: [
      "Нужна настройка, автоматизация, работа со стратегией или индивидуальный бот?",
      "Выберите одно направление услуг.",
      "Расскажите, какие исследования или сигналы вам нужны.",
      "Консультация по автоматизации / настройке",
      "Запрос на анализ / разработку стратегии",
      "Опишите нужного бота или интеграцию.",
    ],
    forbiddenRu: [
      "Need setup, automation, strategy work, or a custom bot?",
      "Choose one service path.",
      "Tell us what research or signals you need.",
      "Automation / Setup consultation",
      "Strategy Review / Development request",
      "Describe your bot or integration.",
      "Important Risk Disclosure:",
    ],
  },
  { path: "/about" },
  { path: "/trading-guide" },
  { path: "/closed-trades" },
  { path: "/risk-management" },
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
    const primaryNav = document.querySelector(".vx-unified-public-nav");
    const navActions = document.querySelector(".vx-direct-nav-actions");
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
    const linkSnapshot = (root) => root
      ? Array.from(root.querySelectorAll("a")).map((node) => ({ text: String(node.textContent || "").trim(), href: node.getAttribute("href") || "" }))
      : [];
    return {
      lang: document.documentElement.getAttribute("lang") || "",
      runtimeLocalized: document.documentElement.getAttribute("data-vx-ru-runtime-localized") || "",
      text: document.body ? document.body.innerText : "",
      hasMain: Boolean(main),
      directMainChildren,
      styleSheets,
      title: document.title,
      primaryNav: linkSnapshot(primaryNav),
      navActions: linkSnapshot(navActions),
    };
  });
}

function addFailure(report, detail) {
  report.failures.push(detail);
}

function sameArray(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function verifyNavigation(report, viewportName, routePath, snapshot, expectedLabels, localeLabel) {
  const labels = snapshot.primaryNav.map((item) => item.text);
  const hrefs = snapshot.primaryNav.map((item) => item.href);
  const actionLabels = snapshot.navActions.map((item) => item.text);
  const actionHrefs = snapshot.navActions.map((item) => item.href);
  const expectedActions = localeLabel === "RU" ? EXPECTED_RU_ACTIONS : EXPECTED_EN_ACTIONS;
  if (!sameArray(labels, expectedLabels)) {
    addFailure(report, `${viewportName} ${routePath}: ${localeLabel} unified nav labels differ: ${JSON.stringify(labels)}`);
  }
  if (!sameArray(hrefs, EXPECTED_NAV_HREFS)) {
    addFailure(report, `${viewportName} ${routePath}: ${localeLabel} unified nav hrefs differ: ${JSON.stringify(hrefs)}`);
  }
  if (!sameArray(actionLabels, expectedActions)) {
    addFailure(report, `${viewportName} ${routePath}: ${localeLabel} nav actions differ: ${JSON.stringify(actionLabels)}`);
  }
  if (!sameArray(actionHrefs, EXPECTED_ACTION_HREFS)) {
    addFailure(report, `${viewportName} ${routePath}: ${localeLabel} nav action hrefs differ: ${JSON.stringify(actionHrefs)}`);
  }
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
            primaryNav: en.primaryNav,
            navActions: en.navActions,
          };
          record.ru = {
            lang: ru.lang,
            title: ru.title,
            runtimeLocalized: ru.runtimeLocalized,
            directMainChildren: ru.directMainChildren,
            styleSheets: ru.styleSheets,
            primaryNav: ru.primaryNav,
            navActions: ru.navActions,
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

          verifyNavigation(report, viewportName, route.path, en, EXPECTED_EN_NAV, "EN");
          verifyNavigation(report, viewportName, route.path, ru, EXPECTED_RU_NAV, "RU");

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

          if (route.path === "/") {
            const enText = normalizeText(en.text);
            const ruText = normalizeText(ru.text);
            for (const phrase of ["Get 30 Days Free", "View Trading Results", "Request Free Viewer Access"]) {
              if (!enText.includes(phrase)) addFailure(report, `${viewportName} /: EN hero action missing: ${phrase}`);
            }
            for (const phrase of ["30 дней бесплатно", "Посмотреть результаты", "Запросить бесплатный viewer-доступ"]) {
              if (!ruText.includes(phrase)) addFailure(report, `${viewportName} /: RU hero action missing: ${phrase}`);
            }
          }

          if (route.path === "/trading-systems/options") {
            const enText = normalizeText(en.text);
            const ruText = normalizeText(ru.text);
            for (const phrase of [
              "Follow our options trades, from entry to exit.",
              "Updated daily on the website.",
              "Take a look inside.",
              "Realized P&L curve",
              "Every trade, from entry to exit.",
              "Real trades. Daily updates. A record you can check.",
              "These results come from our real trading account.",
              "See new positions",
              "Follow daily updates",
              "Review completed trades",
              "Get Options access for $49/month.",
              "Before you join",
            ]) {
              if (!enText.includes(phrase)) addFailure(report, `${viewportName} ${route.path}: EN Options redesign text missing: ${phrase}`);
            }
            for (const phrase of [
              "Следите за нашими опционными сделками от входа до выхода.",
              "Обновляется ежедневно на сайте.",
              "Кривая реализованного P&L",
              "Каждая сделка — от входа до выхода.",
              "Реальные сделки. Ежедневные обновления. История, которую можно проверить.",
              "Перед подключением",
            ]) {
              if (!ruText.includes(phrase)) addFailure(report, `${viewportName} ${route.path}: RU Options redesign text missing: ${phrase}`);
            }
            for (const legacy of ["protected journal", "evidence boundary", "owner-entered records", "existing viewer access", "the results are part of the service."]) {
              if (enText.toLowerCase().includes(legacy)) addFailure(report, `${viewportName} ${route.path}: legacy Options sales terminology remains: ${legacy}`);
            }

            const [enOptions, ruOptions] = await Promise.all([
              enPage.evaluate(() => {
                const links = Array.from(document.querySelectorAll("a")).map((node) => ({ text: String(node.textContent || "").trim(), href: node.getAttribute("href") || "" }));
                const chart = document.querySelector("#options-public-chart");
                const preview = document.querySelector("#options-preview-card");
                const previewSection = document.querySelector("#options-dashboard-preview");
                const journal = document.querySelector("#option-journal-public");
                return {
                  sales: Boolean(document.querySelector('[data-vx-options-sales-page="1"]')),
                  preview: Boolean(document.querySelector('#options-preview-card.vx-options-dashboard-shot')),
                  chart: Boolean(chart),
                  journal: Boolean(journal),
                  chartBeforePreview: Boolean(chart && preview && (chart.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING)),
                  journalAfterPreview: Boolean(previewSection && journal && (previewSection.compareDocumentPosition(journal) & Node.DOCUMENT_POSITION_FOLLOWING)),
                  paid: links.filter((item) => item.text === "Request Options Subscription — $49/month"),
                  benefitCards: document.querySelectorAll(".vx-options-benefit-grid article.vx-options-benefit-card").length,
                  benefitLinks: document.querySelectorAll(".vx-options-benefit-grid a.vx-options-benefit-card").length,
                  proofs: links.find((item) => item.text.toLowerCase() === "proofs") || null,
                  protectedProofLinks: links.filter((item) => item.href.startsWith("/dashboard/options/") && item.href.includes("/proofs/")),
                  how: links.find((item) => item.text === "See How It Works ↓") || null,
                  previewCta: links.find((item) => item.text === "Preview the Dashboard") || null,
                  compare: links.find((item) => item.text === "Compare All Three Systems →") || null,
                  family: Array.from(document.querySelectorAll(".vx-options-family-nav a")).map((node) => node.getAttribute("href") || ""),
                  overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                };
              }),
              ruPage.evaluate(() => ({
                sales: Boolean(document.querySelector('[data-vx-options-sales-page="1"]')),
                preview: Boolean(document.querySelector('#options-preview-card.vx-options-dashboard-shot')),
                chart: Boolean(document.querySelector("#options-public-chart")),
                journal: Boolean(document.querySelector("#option-journal-public")),
                benefitCards: document.querySelectorAll(".vx-options-benefit-grid article.vx-options-benefit-card").length,
                benefitLinks: document.querySelectorAll(".vx-options-benefit-grid a.vx-options-benefit-card").length,
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
              })),
            ]);
            if (!enOptions.sales || !ruOptions.sales) addFailure(report, `${viewportName} ${route.path}: Options sales-page marker missing`);
            if (!enOptions.preview || !ruOptions.preview) addFailure(report, `${viewportName} ${route.path}: real historical Options preview is missing`);
            if (!enOptions.chart || !ruOptions.chart) addFailure(report, `${viewportName} ${route.path}: public Options realized P&L chart is missing`);
            if (!enOptions.journal || !ruOptions.journal) addFailure(report, `${viewportName} ${route.path}: public Option Journal is missing`);
            if (!enOptions.chartBeforePreview) addFailure(report, `${viewportName} ${route.path}: public Options chart is not above the dashboard example`);
            if (!enOptions.journalAfterPreview) addFailure(report, `${viewportName} ${route.path}: public Option Journal is not below the Product Preview block`);
            const optionsSubscriptionUrl = offer.systemOffer("options").subscription_request_url;
            if (enOptions.paid.length < 2 || enOptions.paid.some((item) => item.href !== optionsSubscriptionUrl)) {
              addFailure(report, `${viewportName} ${route.path}: Options subscription destination is incorrect: ${JSON.stringify(enOptions.paid)}`);
            }
            if (enOptions.benefitCards !== 3 || enOptions.benefitLinks !== 0) {
              addFailure(report, `${viewportName} ${route.path}: EN benefit-card structure differs: cards=${enOptions.benefitCards} links=${enOptions.benefitLinks}`);
            }
            if (ruOptions.benefitCards !== 3 || ruOptions.benefitLinks !== 0) {
              addFailure(report, `${viewportName} ${route.path}: RU benefit-card structure differs: cards=${ruOptions.benefitCards} links=${ruOptions.benefitLinks}`);
            }
            if (!enOptions.proofs || enOptions.proofs.href !== "#option-journal-public") {
              addFailure(report, `${viewportName} ${route.path}: Results proofs link does not target the public Option Journal`);
            }
            // Only existing authenticated proxy links are public; storage metadata stays private.
            if (enOptions.protectedProofLinks.some(item => !/^\/dashboard\/options\/[0-9a-f-]{36}\/proofs\/[0-9a-f-]{36}$/i.test(item.href))) {
              addFailure(report, `${viewportName} ${route.path}: invalid proof proxy link`);
            }
            for (const [locale, page] of [["en", enPage], ["ru", ruPage]]) {
              const journal = page.locator("#option-journal-public");
              const rows = journal.locator("tbody tr");
              const count = await rows.count();
              const visible = await journal.locator("tbody tr:visible").count();
              const headers = await journal.locator("thead th").allTextContents();
              if (headers.length !== 13 || headers[11] !== (locale === "en" ? "Notes" : "Примечания")) addFailure(report, `${viewportName} ${locale}: Notes column/order missing`);
              if (!count || visible !== Math.min(8, count)) addFailure(report, `${viewportName} ${locale}: initial journal row count ${visible}/${count}`);
              if (await journal.locator("thead th").last().textContent() !== (locale === "en" ? "Proofs" : "Подтверждения")) addFailure(report, `${viewportName} ${locale}: Proofs column missing`);
              const metrics = await journal.evaluate(node => {
                const wrapper = node.querySelector(".vx-options-public-journal-scroll");
                const table = node.querySelector("table");
                const firstCell = table.querySelector("tbody td");
                return { overflow: wrapper.scrollWidth > wrapper.clientWidth + 1, tableOverflow: table.scrollWidth > table.clientWidth + 1, crampedDate: innerWidth <= 760 && firstCell.getBoundingClientRect().width < 100, forbidden: /Add Proof|Delete|Edit/.test(node.textContent) || Boolean(node.querySelector('a[href^="/admin/"],form,input')) };
              });
              if (metrics.overflow || metrics.tableOverflow || metrics.crampedDate || metrics.forbidden) addFailure(report, `${viewportName} ${locale}: journal layout/security ${JSON.stringify(metrics)}`);
              if (count > 8) {
                await journal.locator("#vx-options-show-more").click();
                if (await journal.locator("tbody tr:visible").count() !== count) addFailure(report, `${viewportName} ${locale}: Show More failed`);
                await journal.locator("#vx-options-show-more").click();
                if (await journal.locator("tbody tr:visible").count() !== 8) addFailure(report, `${viewportName} ${locale}: Show Less failed`);
              }
              if (await page.locator(".vx-options-x-tick").count() < 1 || await page.locator(".vx-options-y-tick").count() < 3 || await page.locator(".vx-options-grid").count() < 3) addFailure(report, `${viewportName} ${locale}: chart axes/grid missing`);
              const proxy = await journal.locator('a[href^="/dashboard/options/"]').first().getAttribute("href").catch(() => null);
              if (proxy) {
                const response = await page.request.get(new URL(proxy, page.url()).href, { maxRedirects: 0 });
                if (response.status() !== 302 || response.headers().location !== "/login") addFailure(report, `${viewportName} ${locale}: proof authentication boundary failed`);
              }
            }
            if (!enOptions.how || enOptions.how.href !== "#options-preview-card") addFailure(report, `${viewportName} ${route.path}: See How It Works target is incorrect`);
            if (!enOptions.previewCta || enOptions.previewCta.href !== "#options-preview-card") addFailure(report, `${viewportName} ${route.path}: Preview the Dashboard target is incorrect`);
            if (!enOptions.compare || enOptions.compare.href !== "/pricing") addFailure(report, `${viewportName} ${route.path}: Compare All Three Systems target is incorrect`);
            if (!sameArray(enOptions.family, ["/trading-systems/day-trading", "/trading-systems/swing-trading", "/trading-systems/options"])) {
              addFailure(report, `${viewportName} ${route.path}: direct Options family navigation differs: ${JSON.stringify(enOptions.family)}`);
            }
            if (enOptions.overflow || ruOptions.overflow) addFailure(report, `${viewportName} ${route.path}: Options page has horizontal overflow`);
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
    "- Unified public navigation labels, destinations, Log In, and the Day Trading trial CTA are verified on every configured public route at desktop and mobile widths.",
    "- Strict translation assertions target known production regressions on Home, Day Trading, Options, Results, Pricing, and Services.",
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
