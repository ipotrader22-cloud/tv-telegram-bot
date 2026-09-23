"use strict";

const Module = require("module");
const { SINGLE_SYSTEM_PRICE_MONTHLY, SYSTEMS, singleSystemRequestUrl } = require("./lib/website-commercial-offer");

const OPTIONS_PATH = "/trading-systems/options";
const OPTIONS_VIEWER_PATH = `${OPTIONS_PATH}/viewer`;
const PRICING_PATH = "/pricing";
const OPTION_JOURNAL_RANGE = "'Option Journal'!A:S";
const STYLE_ID = "vx-options-sales-page-style";
const PAGE_MARKER = 'data-vx-options-sales-page="1"';
const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

let previewCache = { expiresAt: 0, value: null, inFlight: null };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHost(value) {
  return String(value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function requestLocale(req) {
  const host = normalizeHost(req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "");
  return host === "ru.vixale.com" ? "ru" : "en";
}

function optionTradeFromRow(row = []) {
  return {
    trade_date: String(row[1] || ""),
    entry_time: String(row[2] || ""),
    symbol: String(row[3] || ""),
    strategy: String(row[4] || ""),
    legs: String(row[5] || ""),
    expiration: String(row[6] || ""),
    contracts: Number(row[7] || 0),
    multiplier: Number(row[8] || 100),
    trade_type: String(row[9] || ""),
    entry_price: Number(row[10] || 0),
    exit_date: String(row[11] || ""),
    exit_time: String(row[12] || ""),
    exit_price: row[13] == null || row[13] === "" ? "" : Number(row[13]),
    fees: Number(row[14] || 0),
    status: String(row[15] || ""),
  };
}

function optionPnl(trade) {
  if (!trade || String(trade.status).toLowerCase() !== "closed" || trade.exit_price === "") return null;
  const fields = [trade.entry_price, trade.exit_price, trade.contracts, trade.multiplier, trade.fees];
  if (fields.some(value => !Number.isFinite(Number(value)))) return null;
  const difference = String(trade.trade_type).toLowerCase() === "credit"
    ? trade.entry_price - trade.exit_price
    : trade.exit_price - trade.entry_price;
  const pnl = difference * trade.contracts * trade.multiplier - trade.fees;
  return Number.isFinite(pnl) ? Math.round((pnl + Number.EPSILON) * 100) / 100 : null;
}

function buildPublicPreview(values) {
  const rows = Array.isArray(values) ? values : [];
  const start = rows.length && String(rows[0]?.[0] || "").trim().toUpperCase() === "ID" ? 1 : 0;
  const trades = rows.slice(start)
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? "").trim() !== ""))
    .map(optionTradeFromRow);

  const closed = trades.filter(trade =>
    String(trade.status).toLowerCase() === "closed" &&
    trade.symbol &&
    trade.trade_date &&
    Number.isFinite(trade.entry_price) &&
    trade.exit_date &&
    trade.exit_price !== "" &&
    Number.isFinite(Number(trade.exit_price))
  );

  const trade = closed.length ? closed[closed.length - 1] : null;
  if (!trade) return { available: false, reason: "no_closed_trade" };
  return {
    available: true,
    trade: { ...trade, pnl: optionPnl(trade) },
    loaded_at: new Date().toISOString(),
  };
}

async function loadOptionsPreviewFromSheets() {
  const spreadsheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
  const credentialsJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!spreadsheetId || !credentialsJson) throw new Error("Options preview source is not configured");
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: OPTION_JOURNAL_RANGE });
  return buildPublicPreview(response.data.values || []);
}

async function loadCachedOptionsPreview(loader = loadOptionsPreviewFromSheets) {
  const now = Date.now();
  if (previewCache.value && previewCache.expiresAt > now) return previewCache.value;
  if (previewCache.inFlight) return previewCache.inFlight;
  previewCache.inFlight = Promise.resolve()
    .then(loader)
    .then(value => {
      previewCache = { value, expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS, inFlight: null };
      return value;
    })
    .catch(error => {
      previewCache.inFlight = null;
      throw error;
    });
  return previewCache.inFlight;
}

function resetPreviewCache() {
  previewCache = { expiresAt: 0, value: null, inFlight: null };
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}$${Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function price(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `$${Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function previewCard(preview, locale = "en", compact = false) {
  const ru = locale === "ru";
  if (!preview?.available || !preview.trade) {
    return `<div class="vx-options-preview-empty">${ru ? "Предпросмотр исторической сделки временно недоступен." : "Historical trade preview is temporarily unavailable."}</div>`;
  }
  const t = preview.trade;
  const pnl = t.pnl == null ? "—" : money(t.pnl);
  const fields = [
    [ru ? "Тикер" : "Underlying", t.symbol],
    [ru ? "Контракт / ноги" : "Option contract / legs", t.legs || "—"],
    [ru ? "Экспирация" : "Expiration", t.expiration || "—"],
    [ru ? "Тип сделки" : "Trade type", t.trade_type || "—"],
    [ru ? "Контракты" : "Contracts", Number.isFinite(t.contracts) && t.contracts > 0 ? String(t.contracts) : "—"],
    [ru ? "Цена входа" : "Entry price", price(t.entry_price)],
    [ru ? "Цена выхода" : "Exit price", price(t.exit_price)],
    [ru ? "Результат" : "Recorded P/L", pnl],
  ];
  return `<div class="vx-options-dashboard-shot${compact ? " compact" : ""}" id="${compact ? "options-hero-preview" : "options-preview-card"}">
    <div class="vx-options-shot-bar"><div><span class="dot"></span>${ru ? "ПРИМЕР ИЗ OPTIONS DASHBOARD" : "ACTUAL OPTIONS DASHBOARD EXAMPLE"}</div><span>${escapeHtml(t.status || "Closed")}</span></div>
    <div class="vx-options-shot-title"><div><strong>${escapeHtml(t.symbol)}</strong><span>${ru ? "Историческая закрытая сделка" : "Historical closed trade"}</span></div><b>${escapeHtml(pnl)}</b></div>
    <div class="vx-options-shot-callouts"><span>${ru ? "ВХОД" : "ENTRY"} · ${escapeHtml(t.trade_date)}</span><span>${ru ? "ЗАКРЫТЫЙ РЕЗУЛЬТАТ" : "CLOSED RESULT"} · ${escapeHtml(t.exit_date)}</span></div>
    <div class="vx-options-shot-grid">${fields.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
    ${t.strategy ? `<div class="vx-options-shot-note"><span>${ru ? "Стратегия / заметка" : "Strategy / note"}</span><strong>${escapeHtml(t.strategy)}</strong></div>` : ""}
  </div>`;
}

function renderOptionsSalesMain(preview, locale = "en") {
  const ru = locale === "ru";
  const requestUrl = singleSystemRequestUrl("Options");
  const dayPath = SYSTEMS.find(system => system.key === "day-trading")?.path || "/trading-systems/day-trading";
  const swingPath = SYSTEMS.find(system => system.key === "swing-trading")?.path || "/trading-systems/swing-trading";
  const copy = ru ? {
    eyebrow: `ОПЦИОНЫ · $${SINGLE_SYSTEM_PRICE_MONTHLY}/МЕСЯЦ`,
    hero: "Следите за нашими опционными сделками от входа до выхода.",
    lead: `Смотрите открываемые нами позиции, следите за ежедневными обновлениями и изучайте результаты после закрытия сделок. Доступ к Options dashboard — $${SINGLE_SYSTEM_PRICE_MONTHLY} в месяц.`,
    primary: "Запросить доступ к опционам",
    secondary: "Как это работает ↓",
    daily: "Обновляется ежедневно на сайте.",
    previewKicker: "ПРЕДПРОСМОТР ПРОДУКТА",
    previewTitle: "Посмотрите, как всё устроено.",
    previewLead: "Ниже показан реальный исторический пример из существующего Options dashboard с фактическими датами и полями журнала. Текущие открытые позиции здесь не раскрываются.",
    previewCta: "Предпросмотр dashboard",
    featureTitle: "Знайте, что открыто. Видьте, что меняется.",
    featureLead: "Следите за нашими опционными позициями в одном месте и возвращайтесь к опубликованной записи на протяжении всей сделки.",
    cards: [
      ["Новые позиции", "Просматривайте сделки, которые мы добавляем в dashboard."],
      ["Ежедневные обновления", "Проверяйте последний опубликованный статус открытых позиций."],
      ["Завершённые сделки", "Смотрите результаты закрытых сделок, включая зафиксированную прибыль или убыток."],
    ],
    resultsKicker: "РЕЗУЛЬТАТЫ",
    resultsTitle: "Результаты входят в сервис.",
    resultsLead: "Подписка включает доступ к истории закрытых сделок и доступным брокерским скриншотам, чтобы можно было смотреть не только последнее обновление, но и торговую историю.",
    resultsStrong: "Открытые позиции. Закрытые сделки. Зафиксированные результаты.",
    past: "Прошлые результаты не гарантируют будущих результатов.",
    pricingKicker: "ПОДПИСКА",
    pricingTitle: `Доступ к опционам — $${SINGLE_SYSTEM_PRICE_MONTHLY}/месяц.`,
    included: "В подписку входит:",
    items: ["Доступ к Options dashboard", "Ежедневные обновления позиций", "История закрытых сделок с зафиксированной прибылью и убытком", "Доступные брокерские скриншоты, подтверждающие записи"],
    manual: "Платное подключение сейчас оформляется вручную через Vixale в Telegram. Кнопка открывает заранее заполненный запрос; детали активации, оплаты и доступа подтверждаются в процессе подключения.",
    cross: "Интересуют также Day Trading и Swing Trading?",
    compare: "Сравнить все три системы →",
    faqTitle: "Перед подключением",
    faq: [
      ["Где следить за сделками?", "В Options dashboard на нашем сайте."],
      ["Как часто обновляются позиции?", "Обновления публикуются ежедневно. Сервис предназначен для отслеживания опубликованных обновлений позиций."],
      ["Отправляются ли сигналы по опционам в Telegram?", "Обновления по опционам сейчас доступны на сайте."],
      ["Можно ли просматривать завершённые сделки?", "Да. Подписчики могут просматривать историю закрытых сделок и доступные подтверждающие брокерские скриншоты."],
      ["Размещает ли подписка сделки за меня?", "Нет. Вы сами решаете, торговать ли, и размещаете любые заявки через свой брокерский счёт."],
    ],
    risk: "Торговля опционами связана с риском. Подписка не гарантирует прибыль.",
    navDay: "Дейтрейдинг", navSwing: "Свинг-трейдинг", navOptions: "Опционы",
  } : {
    eyebrow: `OPTIONS · $${SINGLE_SYSTEM_PRICE_MONTHLY}/MONTH`,
    hero: "Follow our options trades, from entry to exit.",
    lead: `See the positions we open, follow daily updates, and review the results when trades close. Get access to our options dashboard for $${SINGLE_SYSTEM_PRICE_MONTHLY}/month.`,
    primary: "Request Options Access",
    secondary: "See How It Works ↓",
    daily: "Updated daily on the website.",
    previewKicker: "PRODUCT PREVIEW",
    previewTitle: "Take a look inside.",
    previewLead: "This is a real historical example from the existing Options dashboard, using actual journal fields and trade dates. Current open positions are not exposed in this public preview.",
    previewCta: "Preview the Dashboard",
    featureTitle: "Know what’s open. See what changes.",
    featureLead: "Keep track of our options positions in one place, with a record you can return to throughout the trade.",
    cards: [
      ["See new positions", "Review the trades we add to the dashboard."],
      ["Follow daily updates", "Check the latest published status of open positions."],
      ["Review completed trades", "See how closed trades performed, including their recorded profit or loss."],
    ],
    resultsKicker: "RESULTS",
    resultsTitle: "The results are part of the service.",
    resultsLead: "Your subscription includes access to our closed-trade history and available brokerage screenshots, so you can look beyond the latest update and review the trading record.",
    resultsStrong: "Open positions. Closed trades. Recorded results.",
    past: "Past performance does not guarantee future results.",
    pricingKicker: "SUBSCRIPTION",
    pricingTitle: `Get Options access for $${SINGLE_SYSTEM_PRICE_MONTHLY}/month.`,
    included: "Your subscription includes:",
    items: ["Access to the options dashboard", "Daily position updates", "Closed-trade history with recorded profit and loss", "Available brokerage screenshots supporting the record"],
    manual: "Paid onboarding is currently handled manually through Vixale on Telegram. The button opens a pre-filled plan request; activation, payment, and access details are confirmed during onboarding.",
    cross: "Interested in Day Trading and Swing Trading too?",
    compare: "Compare All Three Systems →",
    faqTitle: "Before you join",
    faq: [
      ["Where do I follow the trades?", "In the options dashboard on our website."],
      ["How often are positions updated?", "Updates are published daily. This service is designed for following published position updates."],
      ["Are options signals sent through Telegram?", "Options updates are currently available on the website."],
      ["Can I review completed trades?", "Yes. Subscribers can access the closed-trade history and available supporting brokerage screenshots."],
      ["Does the subscription place trades for me?", "No. You decide whether to trade and place any orders through your own brokerage account."],
    ],
    risk: "Options trading involves risk. A subscription does not guarantee profits.",
    navDay: "Day Trading", navSwing: "Swing Trading", navOptions: "Options",
  };

  return `<div class="vx-options-sales" ${PAGE_MARKER}>
    <nav class="vx-options-family-nav" aria-label="${ru ? "Торговые системы Vixale" : "Vixale trading systems"}">
      <a href="${dayPath}">${copy.navDay}</a><a href="${swingPath}">${copy.navSwing}</a><a class="active" href="${OPTIONS_PATH}" aria-current="page">${copy.navOptions}</a>
    </nav>

    <section class="vx-options-hero">
      <div class="vx-options-hero-copy">
        <span class="vx-options-kicker">${copy.eyebrow}</span>
        <h1>${copy.hero}</h1>
        <p>${copy.lead}</p>
        <div class="vx-options-actions"><a class="primary" href="${escapeHtml(requestUrl)}" target="_blank" rel="noopener noreferrer">${copy.primary}</a><a href="#options-dashboard-preview">${copy.secondary}</a></div>
        <div class="vx-options-daily">${copy.daily}</div>
      </div>
      <div class="vx-options-hero-preview">${previewCard(preview, locale, true)}</div>
    </section>

    <section class="vx-options-preview-section" id="options-dashboard-preview" aria-labelledby="vx-options-preview-title">
      <div class="vx-options-section-copy"><span class="vx-options-kicker">${copy.previewKicker}</span><h2 id="vx-options-preview-title">${copy.previewTitle}</h2><p>${copy.previewLead}</p><a class="vx-options-inline-cta" href="#options-preview-card">${copy.previewCta}</a></div>
      ${previewCard(preview, locale, false)}
    </section>

    <section class="vx-options-benefits" aria-labelledby="vx-options-benefits-title">
      <span class="vx-options-kicker">${ru ? "ЧТО ВЫ ПОЛУЧАЕТЕ" : "WHAT YOU GET"}</span>
      <h2 id="vx-options-benefits-title">${copy.featureTitle}</h2><p>${copy.featureLead}</p>
      <div class="vx-options-benefit-grid">${copy.cards.map(([title, body], index) => `<article><span>0${index + 1}</span><h3>${title}</h3><p>${body}</p></article>`).join("")}</div>
    </section>

    <section class="vx-options-results" aria-labelledby="vx-options-results-title">
      <div><span class="vx-options-kicker">${copy.resultsKicker}</span><h2 id="vx-options-results-title">${copy.resultsTitle}</h2><p>${copy.resultsLead}</p><strong>${copy.resultsStrong}</strong><small>${copy.past}</small></div>
      <div class="vx-options-results-preview">${previewCard(preview, locale, true)}</div>
    </section>

    <section class="vx-options-subscription" aria-labelledby="vx-options-subscription-title">
      <div class="vx-options-price-card"><span class="vx-options-kicker">${copy.pricingKicker}</span><h2 id="vx-options-subscription-title">${copy.pricingTitle}</h2><p>${copy.included}</p><ul>${copy.items.map(item => `<li>${item}</li>`).join("")}</ul><a class="vx-options-request" href="${escapeHtml(requestUrl)}" target="_blank" rel="noopener noreferrer">${copy.primary}</a><small>${copy.manual}</small></div>
      <aside><span>${copy.cross}</span><a href="${PRICING_PATH}">${copy.compare}</a></aside>
    </section>

    <section class="vx-options-faq" aria-labelledby="vx-options-faq-title">
      <span class="vx-options-kicker">FAQ</span><h2 id="vx-options-faq-title">${copy.faqTitle}</h2>
      <div class="vx-options-faq-grid">${copy.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
      <p class="vx-options-final-risk">${copy.risk}</p>
    </section>
  </div>`;
}

const styles = `<style id="${STYLE_ID}">
.vx-options-sales{max-width:1180px;margin:0 auto;padding:28px 24px 78px;box-sizing:border-box;color:#17211d}.vx-options-family-nav{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:34px}.vx-options-family-nav a{padding:9px 13px;border:1px solid #d7e4dd;border-radius:999px;color:#53615b;text-decoration:none;font-size:12px;font-weight:700}.vx-options-family-nav a.active{border-color:#0a9658;background:#edf9f2;color:#176442}.vx-options-kicker{display:block;color:#287153;font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.vx-options-hero{display:grid;grid-template-columns:minmax(0,.95fr) minmax(420px,1.05fr);gap:38px;align-items:center;padding:10px 0 48px}.vx-options-hero h1{max-width:650px;margin:10px 0 0;font-size:clamp(43px,5.4vw,68px);font-weight:530;line-height:1.01;letter-spacing:-.048em}.vx-options-hero-copy>p,.vx-options-section-copy>p,.vx-options-benefits>p,.vx-options-results p{margin:16px 0 0;color:#596761;font-size:15.5px;line-height:1.62}.vx-options-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:23px}.vx-options-actions a,.vx-options-request,.vx-options-inline-cta{display:inline-flex;align-items:center;justify-content:center;min-height:45px;padding:0 18px;border:1px solid #c7d8cf;border-radius:999px;background:#fff;color:#17211d;text-decoration:none;font-size:12.5px;font-weight:760}.vx-options-actions a.primary,.vx-options-request{border-color:#078f51;background:#078f51;color:#fff}.vx-options-daily{margin-top:13px;color:#64716b;font-size:12px;font-weight:650}.vx-options-dashboard-shot{padding:20px;border:1px solid #164a37;border-radius:22px;background:linear-gradient(145deg,#0d2e22,#174a37);color:#fff;box-shadow:0 22px 55px rgba(13,48,35,.15)}.vx-options-dashboard-shot.compact{padding:17px}.vx-options-shot-bar,.vx-options-shot-title,.vx-options-shot-callouts{display:flex;justify-content:space-between;gap:12px;align-items:center}.vx-options-shot-bar{color:#b9cec3;font-size:9.5px;font-weight:760;letter-spacing:.055em}.vx-options-shot-bar .dot{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:#55d99a}.vx-options-shot-title{margin-top:18px}.vx-options-shot-title strong{font-size:25px;font-weight:590}.vx-options-shot-title span{display:block;margin-top:3px;color:#b9cec3;font-size:10px}.vx-options-shot-title b{font-size:19px;font-weight:600}.vx-options-shot-callouts{justify-content:flex-start;flex-wrap:wrap;margin-top:15px}.vx-options-shot-callouts span{padding:6px 8px;border:1px solid rgba(255,255,255,.13);border-radius:999px;color:#c6ddd2;font-size:9px;font-weight:750}.vx-options-shot-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:14px}.vx-options-shot-grid>div,.vx-options-shot-note{padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.045);min-width:0}.vx-options-shot-grid span,.vx-options-shot-note span{display:block;color:#aac2b6;font-size:8.8px}.vx-options-shot-grid strong,.vx-options-shot-note strong{display:block;margin-top:4px;font-size:11px;font-weight:650;word-break:break-word}.vx-options-shot-note{margin-top:7px}.vx-options-dashboard-shot.compact .vx-options-shot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vx-options-preview-empty{display:flex;min-height:240px;align-items:center;justify-content:center;padding:24px;border:1px dashed #b9cfc3;border-radius:22px;background:#f6faf8;color:#65716c;text-align:center;font-size:13px}.vx-options-preview-section{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(0,1.3fr);gap:28px;align-items:center;padding:38px 0 54px;border-top:1px solid #e1e9e5}.vx-options-section-copy h2,.vx-options-benefits h2,.vx-options-results h2,.vx-options-subscription h2,.vx-options-faq h2{margin:8px 0 0;font-size:clamp(30px,4vw,45px);font-weight:540;line-height:1.05;letter-spacing:-.035em}.vx-options-inline-cta{margin-top:18px}.vx-options-benefits{margin:0 -24px;padding:42px 24px 46px;border-radius:28px;background:linear-gradient(145deg,#0e3024,#174b38);color:#fff}.vx-options-benefits .vx-options-kicker{color:#8bd5b2}.vx-options-benefits h2{color:#fff;max-width:760px}.vx-options-benefits>p{color:#c1d4ca;max-width:760px}.vx-options-benefit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:24px}.vx-options-benefit-grid article{padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.05)}.vx-options-benefit-grid article>span{color:#91cdb0;font-size:10px;font-weight:800}.vx-options-benefit-grid h3{margin:8px 0 0;font-size:18px;font-weight:580}.vx-options-benefit-grid p{margin:8px 0 0;color:#c1d4ca;font-size:12.5px;line-height:1.55}.vx-options-results{display:grid;grid-template-columns:minmax(0,.8fr) minmax(380px,1.2fr);gap:30px;align-items:center;padding:56px 0}.vx-options-results strong{display:block;margin-top:19px;font-size:15px}.vx-options-results small{display:block;margin-top:12px;color:#6f7b75;font-size:11.5px}.vx-options-subscription{padding:34px 0 48px;border-top:1px solid #e1e9e5}.vx-options-price-card{max-width:760px;margin:0 auto;padding:30px;border:1px solid #c8e2d5;border-radius:24px;background:linear-gradient(145deg,#f1faf5,#fff);box-shadow:0 16px 42px rgba(24,54,42,.05)}.vx-options-price-card>p{margin:13px 0 0;color:#596761;font-size:13px}.vx-options-price-card ul{display:grid;gap:9px;margin:19px 0 0;padding:0;list-style:none}.vx-options-price-card li{position:relative;padding-left:20px;color:#4f5e57;font-size:13px}.vx-options-price-card li:before{content:"✓";position:absolute;left:0;color:#078f51;font-weight:800}.vx-options-request{margin-top:23px}.vx-options-price-card small{display:block;margin-top:11px;color:#6c7872;font-size:11.5px;line-height:1.5}.vx-options-subscription aside{display:flex;align-items:center;justify-content:center;gap:13px;flex-wrap:wrap;margin-top:17px;color:#5f6d67;font-size:12.5px}.vx-options-subscription aside a{color:#176442;font-weight:760;text-decoration:none}.vx-options-faq{padding-top:36px;border-top:1px solid #e1e9e5}.vx-options-faq-grid{display:grid;gap:8px;max-width:880px;margin-top:22px}.vx-options-faq details{padding:15px 17px;border:1px solid #dce6e1;border-radius:14px;background:#fff}.vx-options-faq summary{cursor:pointer;font-size:13.5px;font-weight:700}.vx-options-faq details p{margin:9px 0 0;color:#5f6d67;font-size:12.5px;line-height:1.55}.vx-options-final-risk{margin:22px 0 0;color:#6e7974;font-size:11.5px}.vx-options-results-preview .vx-options-dashboard-shot{box-shadow:none}@media(max-width:900px){.vx-options-hero,.vx-options-preview-section,.vx-options-results{grid-template-columns:1fr}.vx-options-hero{gap:24px}.vx-options-hero-preview{max-width:720px}.vx-options-benefit-grid{grid-template-columns:1fr}.vx-options-results-preview{max-width:720px}}@media(max-width:620px){.vx-options-sales{padding:20px 16px 56px}.vx-options-family-nav{margin-bottom:24px}.vx-options-hero{padding-bottom:36px}.vx-options-actions a,.vx-options-request{width:100%;box-sizing:border-box}.vx-options-shot-grid,.vx-options-dashboard-shot.compact .vx-options-shot-grid{grid-template-columns:1fr 1fr}.vx-options-shot-bar{align-items:flex-start;flex-direction:column}.vx-options-shot-title{align-items:flex-start}.vx-options-preview-section{padding:32px 0 42px}.vx-options-benefits{margin:0;padding:30px 18px 34px}.vx-options-results{padding:42px 0}.vx-options-price-card{padding:22px}.vx-options-dashboard-shot{padding:15px}.vx-options-subscription aside{align-items:flex-start;flex-direction:column}.vx-options-preview-empty{min-height:180px}}@media(max-width:420px){.vx-options-shot-grid,.vx-options-dashboard-shot.compact .vx-options-shot-grid{grid-template-columns:1fr}}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function replaceMain(html, inner) {
  const source = String(html || "");
  const start = source.search(/<main\b/i);
  if (start < 0) return source;
  const openEnd = source.indexOf(">", start);
  if (openEnd < 0) return source;
  const re = /<\/?main\b[^>]*>/gi;
  re.lastIndex = start;
  let depth = 0, match;
  while ((match = re.exec(source))) {
    depth += /^<\/main\b/i.test(match[0]) ? -1 : 1;
    if (depth === 0) return source.slice(0, openEnd + 1) + `\n${inner}\n` + source.slice(match.index);
  }
  return source;
}

function setTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    : html;
}

function refineOptionsSalesPage(html, preview, locale = "en") {
  if (typeof html !== "string" || !html.includes('data-vx-conversion-system-page="options"')) return html;
  if (html.includes(PAGE_MARKER)) return html;
  let out = setTitle(html, locale === "ru" ? "Vixale | Опционы" : "Vixale | Options");
  out = replaceMain(out, renderOptionsSalesMain(preview, locale));
  return injectStyles(out);
}

function installOptionsSalesPageRefinement(app, dependencies = {}) {
  const loadPreview = dependencies.loadPreview || loadCachedOptionsPreview;
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const pathname = String(req.path || req.url || "/").split("?")[0];
    if ((method !== "GET" && method !== "HEAD") || pathname !== OPTIONS_PATH) return next();
    const send = res.send.bind(res);
    res.send = function sendWithOptionsSalesPage(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      if (typeof body !== "string" || (type && !type.includes("html")) || res.statusCode >= 300) return send(body);
      const locale = requestLocale(req);
      Promise.resolve()
        .then(() => loadPreview())
        .then(preview => send(refineOptionsSalesPage(body, preview, locale)))
        .catch(error => {
          console.error("Options public preview load error:", String(error?.message || error || "unknown"));
          send(refineOptionsSalesPage(body, { available: false, reason: "unavailable" }, locale));
        });
      return res;
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) {
      try { Object.defineProperty(target, key, descriptor); } catch (_) {}
    }
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleOptionsSalesPageWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installOptionsSalesPageRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleOptionsSalesPageWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleOptionsSalesPageModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  OPTIONS_PATH, OPTIONS_VIEWER_PATH, PRICING_PATH, OPTION_JOURNAL_RANGE, STYLE_ID, PAGE_MARKER,
  PREVIEW_CACHE_TTL_MS, optionTradeFromRow, optionPnl, buildPublicPreview, loadOptionsPreviewFromSheets,
  loadCachedOptionsPreview, resetPreviewCache, previewCard, renderOptionsSalesMain, injectStyles,
  replaceMain, refineOptionsSalesPage, installOptionsSalesPageRefinement, wrapExpress,
};
