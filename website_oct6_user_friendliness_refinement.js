"use strict";

const Module = require("module");
const offer = require("./lib/website-commercial-offer");

const STYLE_ID = "vx-oct6-user-friendliness-style";
const SCRIPT_ID = "vx-oct6-user-friendliness-funnel";
const PUBLIC_PATHS = new Set([
  "/",
  "/trading-systems",
  "/trading-systems/day-trading",
  "/trading-systems/swing-trading",
  "/trading-systems/options",
  "/results",
  "/pricing",
  "/access",
  "/about",
  "/services",
  "/trading-guide",
  "/closed-trades",
  "/risk-management",
  "/daily-trading-summary",
]);

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0];
}

function requestLocale(req) {
  const host = String(req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "")
    .split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return host === "ru.vixale.com" ? "ru" : "en";
}

function isPublicPath(path) {
  return PUBLIC_PATHS.has(path) || path.startsWith("/daily-trading-summary/");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(value) {
  return String(value).replace(/./g, ch => "\\^$.*+?()[]{}|".includes(ch) ? "\\" + ch : ch);
}

function tagRange(html, tag, start) {
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp("<\\/?" + escapeRegex(tag) + "\\b[^>]*>", "gi");
  re.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = re.exec(html))) {
    depth += new RegExp("^<\\/" + escapeRegex(tag) + "\\b", "i").test(match[0]) ? -1 : 1;
    if (depth === 0) return { start, end: re.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}

function rangeByClass(html, tag, className) {
  const re = new RegExp("<" + escapeRegex(tag) + "\\b[^>]*\\bclass=([\"'])[^\"']*\\b" + escapeRegex(className) + "\\b[^\"']*\\1[^>]*>", "i");
  const match = re.exec(String(html || ""));
  return match ? tagRange(html, tag, match.index) : null;
}

function rangeById(html, tag, id) {
  const re = new RegExp("<" + escapeRegex(tag) + "\\b[^>]*\\bid=([\"'])" + escapeRegex(id) + "\\1[^>]*>", "i");
  const match = re.exec(String(html || ""));
  return match ? tagRange(html, tag, match.index) : null;
}

function replaceInner(html, range, inner) {
  if (!range) return html;
  return html.slice(0, range.openEnd) + inner + html.slice(range.closeStart);
}

function replaceRange(html, range, replacement) {
  if (!range) return html;
  return html.slice(0, range.start) + replacement + html.slice(range.end);
}

function appendInside(html, range, fragment) {
  if (!range) return html;
  return html.slice(0, range.closeStart) + fragment + html.slice(range.closeStart);
}

function copy(locale) {
  if (locale === "ru") {
    return {
      day: "Дейтрейдинг",
      swing: "Свинг-трейдинг",
      options: "Опционы",
      results: "Результаты",
      pricing: "Тарифы",
      login: "Войти",
      trial: "30 дней бесплатно",
      how: "Как это работает",
      systems: "Торговые системы",
      recaps: "Ежедневные итоги",
      services: "Услуги",
      about: "О нас",
      help: "Помощь",
      viewer: "Запросить бесплатный viewer-доступ",
      heroLead: "Vixale публикует торговые сигналы и обновления портфеля. Следите за сигналами Day Trading в Telegram, за обновлениями Swing и Options на сайте и размещайте сделки через своего брокера.",
      trialMicro: "30 дней сигналов Day Trading через Telegram. Запросите пробный доступ в Telegram; мы подтвердим активацию.",
      viewResults: "Посмотреть результаты",
      exploreDay: "Подробнее о Day Trading",
      viewSwing: "Посмотреть Swing Portfolio",
      exploreOptions: "Подробнее об Options",
      paidOptions: "Запросить подписку Options — $49/месяц",
      paidSwing: "Запросить подписку Swing — $49/месяц",
      recordedOptions: "Зафиксированные результаты Options",
    };
  }
  return {
    day: "Day Trading",
    swing: "Swing Trading",
    options: "Options",
    results: "Results",
    pricing: "Pricing",
    login: "Log In",
    trial: "Get 30 Days Free",
    how: "How It Works",
    systems: "Trading Systems",
    recaps: "Daily Recaps",
    services: "Services",
    about: "About",
    help: "Help",
    viewer: "Request Free Viewer Access",
    heroLead: "Vixale publishes trading signals and portfolio updates. Follow Day Trading signals in Telegram, review Swing and Options updates on the website, and place any trades through your own broker.",
    trialMicro: "30 days of Day Trading signals through Telegram. Request your trial on Telegram; we’ll confirm activation.",
    viewResults: "View Trading Results",
    exploreDay: "Explore Day Trading",
    viewSwing: "View Swing Portfolio",
    exploreOptions: "Explore Options",
    paidOptions: "Request Options Subscription — $49/month",
    paidSwing: "Request Swing Subscription — $49/month",
    recordedOptions: "Recorded Options Results",
  };
}

function active(path, href) {
  return path === href || (href === "/daily-trading-summary" && path.startsWith("/daily-trading-summary/"));
}

function navLink(path, href, label) {
  return '<a href="' + href + '"' + (active(path, href) ? ' class="is-active" aria-current="page"' : "") + ">" + label + "</a>";
}

function renderPrimaryNavigation(path, locale) {
  const c = copy(locale);
  return [
    navLink(path, "/trading-systems/day-trading", c.day),
    navLink(path, "/trading-systems/swing-trading", c.swing),
    navLink(path, "/trading-systems/options", c.options),
    navLink(path, "/results", c.results),
    navLink(path, "/pricing", c.pricing),
  ].join("");
}

function renderNavigationActions(locale) {
  const c = copy(locale);
  return '<a class="vx-public-nav-login" href="/dashboard">' + c.login + '</a>' +
    '<a class="vx-public-nav-cta" data-vx-funnel-kind="trial" data-vx-funnel-system="day-trading" data-vx-funnel-offer="day-trial" href="' +
    esc(offer.DAY_TRIAL_URL) + '" target="_blank" rel="noopener noreferrer">' + c.trial + "</a>";
}

function renderSecondaryNavigation(locale) {
  const c = copy(locale);
  return '<a href="/trading-systems#vx-how-to-trade-title">' + c.how + '</a>' +
    '<a href="/trading-systems">' + c.systems + '</a>' +
    '<a href="/daily-trading-summary">' + c.recaps + '</a>' +
    '<a href="/services">' + c.services + '</a>' +
    '<a href="/about">' + c.about + '</a>' +
    '<a href="/trading-guide">' + c.help + "</a>";
}

function refineNavigation(html, path, locale) {
  let out = html;
  const primary = rangeByClass(out, "div", "vx-unified-public-nav");
  if (primary) out = replaceInner(out, primary, renderPrimaryNavigation(path, locale));
  const actions = rangeByClass(out, "div", "vx-direct-nav-actions");
  if (actions) out = replaceInner(out, actions, renderNavigationActions(locale));
  const secondary = rangeByClass(out, "nav", "vx-public-secondary-nav");
  if (secondary) out = replaceInner(out, secondary, renderSecondaryNavigation(locale));
  return out;
}

function renderHomeHeroCopy(locale) {
  const c = copy(locale);
  return '<div class="vx-conversion-kicker">Vixale Trading Systems</div>' +
    '<h1>Trading signals. Three systems. Your choice.</h1>' +
    '<p>' + c.heroLead + '</p>' +
    '<div class="vx-conversion-hero-actions">' +
      '<a class="vx-conversion-btn primary" data-vx-funnel-kind="trial" data-vx-funnel-system="day-trading" data-vx-funnel-offer="day-trial" href="' + esc(offer.DAY_TRIAL_URL) + '" target="_blank" rel="noopener noreferrer">' + c.trial + '</a>' +
      '<a class="vx-conversion-btn" data-vx-funnel-kind="results" data-vx-funnel-offer="results" href="/results">' + c.viewResults + '</a>' +
    '</div>' +
    '<a class="vx-home-viewer-link" data-vx-funnel-kind="viewer" data-vx-funnel-offer="viewer-access" href="/access">' + c.viewer + '</a>' +
    '<div class="vx-conversion-trial-line">' + c.trialMicro + '</div>';
}

function renderHomeCards(locale) {
  const c = copy(locale);
  if (locale === "ru") {
    return '<section class="vx-conversion-system-cards" aria-label="Торговые системы Vixale">' +
      '<article><span>DAY TRADING</span><h2>Prime и Edge в одном продукте.</h2><p>Следите за сигналами акций, входами и выходами. Prime закрывает позиции к концу торгового дня; Edge может удерживать позицию овернайт.</p><p>Сигналы Day Trading приходят в Telegram, а активность и результаты доступны на сайте.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="day-trading" href="/trading-systems/day-trading">' + c.exploreDay + '</a></article>' +
      '<article><span>SWING TRADING</span><h2>Ежедневный модельный портфель.</h2><p>Смотрите добавления, активные позиции и выходы в публичном Swing Portfolio. Обновления публикуются на сайте.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="swing-trading" href="/trading-systems/swing-trading#active-portfolio">' + c.viewSwing + '</a></article>' +
      '<article><span>OPTIONS</span><h2>Позиции, обновления и завершённые сделки.</h2><p>Следите за опубликованными позициями Options и ежедневными обновлениями на сайте. Options не ограничен одной структурой или только 0DTE.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="options" href="/trading-systems/options">' + c.exploreOptions + '</a></article>' +
    '</section>';
  }
  return '<section class="vx-conversion-system-cards" aria-label="Vixale trading systems">' +
    '<article><span>DAY TRADING</span><h2>Prime and Edge in one Day Trading product.</h2><p>Follow stock signals, entries, and exits. Prime closes at the end of the trading day; Edge may hold overnight.</p><p>Day Trading signals are delivered through Telegram, with activity and results available on the website.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="day-trading" href="/trading-systems/day-trading">' + c.exploreDay + '</a></article>' +
    '<article><span>SWING TRADING</span><h2>A daily stock model portfolio.</h2><p>Review additions, active holdings, and exits in the public Swing portfolio. Updates are published on the website.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="swing-trading" href="/trading-systems/swing-trading#active-portfolio">' + c.viewSwing + '</a></article>' +
    '<article><span>OPTIONS</span><h2>Positions, published updates, and completed trades.</h2><p>Follow published Options positions and daily website updates, then review completed trades. Options is not restricted to one structure or to 0DTE.</p><a data-vx-funnel-kind="system" data-vx-funnel-system="options" href="/trading-systems/options">' + c.exploreOptions + '</a></article>' +
  '</section>';
}

function renderHomeOptionsState(locale) {
  const c = copy(locale);
  if (locale === "ru") {
    return '<span>Ежедневные обновления на сайте</span><h3>График и Option Journal открыты для просмотра.</h3><p>Следите за опубликованными позициями, обновлениями и завершёнными сделками на странице Options. Файлы брокерских подтверждений остаются защищёнными и требуют одобренного viewer-доступа.</p><div><a href="/trading-systems/options">' + c.exploreOptions + '</a><a data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="/access?system=options">' + c.viewer + '</a></div>';
  }
  return '<span>Daily website updates</span><h3>Options chart and trade journal are public.</h3><p>Follow published positions, daily updates, and completed trades on the Options page. Brokerage proof files remain protected and require approved viewer access.</p><div><a href="/trading-systems/options">' + c.exploreOptions + '</a><a data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="/access?system=options">' + c.viewer + '</a></div>';
}

function refineHome(html, locale) {
  let out = html;
  const heroCopy = rangeByClass(out, "div", "vx-conversion-hero-copy");
  if (heroCopy) out = replaceInner(out, heroCopy, renderHomeHeroCopy(locale));
  const cards = rangeByClass(out, "section", "vx-conversion-system-cards");
  if (cards) out = replaceRange(out, cards, renderHomeCards(locale));
  const optionsState = rangeByClass(out, "div", "vx-conversion-protected-state");
  if (optionsState) out = replaceInner(out, optionsState, renderHomeOptionsState(locale));
  return out;
}

function rewriteAnchorByText(html, text, href, label, attrs = "") {
  const re = new RegExp('<a\\b([^>]*)>' + escapeRegex(text) + '<\\/a>', "gi");
  return html.replace(re, (_match, existing) => {
    const clean = String(existing || "")
      .replace(/\s+href=(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+target=(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+rel=(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+data-vx-funnel-[a-z-]+=(?:"[^"]*"|'[^']*')/gi, "");
    return '<a href="' + esc(href) + '"' + clean + (attrs ? " " + attrs : "") + ">" + label + "</a>";
  });
}

function restoreOptionsBenefitCards(html) {
  const grid = rangeByClass(html, "div", "vx-options-benefit-grid");
  if (!grid) return html;
  let inner = html.slice(grid.openEnd, grid.closeStart);
  inner = inner.replace(/<a\b([^>]*)class=(["'])vx-options-benefit-card\2[^>]*>/gi, '<article class="vx-options-benefit-card">');
  inner = inner.replace(/<\/a>/gi, "</article>");
  return replaceInner(html, grid, inner);
}

function refineOptions(html, locale) {
  const c = copy(locale);
  const paid = offer.systemOffer("options").subscription_request_url;
  const viewer = offer.systemOffer("options").viewer_access_url;
  let out = html;
  for (const label of ["Request Options Access", "Запросить доступ к опционам", c.paidOptions]) {
    out = rewriteAnchorByText(out, label, paid, c.paidOptions, 'target="_blank" rel="noopener noreferrer" data-vx-funnel-kind="subscription" data-vx-funnel-system="options" data-vx-funnel-offer="single-system"');
  }
  out = restoreOptionsBenefitCards(out);

  const heroActions = rangeByClass(out, "div", "vx-options-actions");
  if (heroActions && !out.slice(heroActions.start, heroActions.end).includes(c.viewer)) {
    out = appendInside(out, heroActions, '<a class="vx-options-viewer-action" data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="' + viewer + '">' + c.viewer + "</a>");
  }

  const priceCard = rangeByClass(out, "div", "vx-options-price-card");
  if (priceCard && !out.slice(priceCard.start, priceCard.end).includes("vx-options-viewer-request")) {
    const requestAnchor = /<a\b[^>]*class=(["'])vx-options-request\1[^>]*>[\s\S]*?<\/a>/i.exec(out.slice(priceCard.start, priceCard.end));
    if (requestAnchor) {
      const absoluteStart = priceCard.start + requestAnchor.index + requestAnchor[0].length;
      const viewerLink = '<a class="vx-options-viewer-request" data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="' + viewer + '">' + c.viewer + "</a>";
      out = out.slice(0, absoluteStart) + viewerLink + out.slice(absoluteStart);
    }
  }

  const replacements = locale === "ru" ? [
    ["Начните с viewer-доступа Vixale: отправьте форму на главной странице, подтвердите email, и мы сообщим дальнейшие детали доступа и подключения.", "Выберите план Options Single System и отправьте подготовленное сообщение в Telegram. Мы ответим с инструкциями по оплате и доступу. Бесплатный viewer-доступ — отдельный процесс для защищённых материалов."],
    ["В подписку входит:", "Что включает запрос подписки:"],
    ["Доступ к Options dashboard", "Сервис Options: опубликованные позиции и обновления"],
    ["История закрытых сделок с зафиксированной прибылью и убытком", "Завершённые сделки и зафиксированные результаты"],
    ["Доступные брокерские скриншоты, подтверждающие записи", "Брокерские файлы остаются под существующими правилами viewer-доступа"],
  ] : [
    ["Start with Vixale viewer access: submit the form on the homepage, verify your email, and we’ll follow up with access and onboarding details.", "Choose the Options Single System plan and send us the prepared Telegram message. We’ll reply with payment and access instructions. Free viewer access is a separate process for protected viewer detail."],
    ["Your subscription includes:", "What the subscription request covers:"],
    ["Access to the options dashboard", "Options service: published positions and website updates"],
    ["Closed-trade history with recorded profit and loss", "Completed trades and recorded results"],
    ["Available brokerage screenshots supporting the record", "Brokerage proof files remain governed by the existing viewer-access permissions"],
  ];
  for (const [from, to] of replacements) out = out.split(from).join(to);

  return out;
}

function renderPricing(locale, selectedKey = "") {
  const c = copy(locale);
  const selected = String(selectedKey || "").trim().toLowerCase();
  const systems = Object.values(offer.OFFER_DEFINITIONS);
  const singleChoices = systems.map(system => {
    const isSelected = selected === system.key;
    const label = locale === "ru" ? ({
      "day-trading": "Дейтрейдинг",
      "swing-trading": "Свинг-трейдинг",
      options: "Опционы",
    }[system.key]) : system.label;
    return '<a class="vx-price-system' + (isSelected ? " is-selected" : "") + '" data-vx-funnel-kind="pricing_plan" data-vx-funnel-system="' + system.key + '" data-vx-funnel-offer="single-system" href="' + esc(system.subscription_request_url) + '" target="_blank" rel="noopener noreferrer"' + (isSelected ? ' aria-current="true"' : "") + '><strong>' + label + '</strong><span>' + (locale === "ru" ? "Запросить $49/месяц →" : "Request $49/month →") + "</span></a>";
  }).join("");

  if (locale === "ru") {
    return '<div class="vx-conversion-pricing" data-vx-conversion-pricing="1">' +
      '<section class="vx-price-hero"><span>ТАРИФЫ</span><h1>Выберите одну систему или все три.</h1><p>Пробный доступ относится только к сигналам Day Trading в Telegram. Планы Day Trading, Swing Trading и Options стоят $49/месяц каждый; пакет из трёх систем — $99/месяц.</p></section>' +
      '<section class="vx-price-grid" aria-label="Тарифы Vixale">' +
        '<article class="vx-price-card trial"><div class="vx-price-kicker">ПРОБНЫЙ DAY TRADING</div><h2>30 дней бесплатно</h2><p class="vx-price-sub">Сигналы Day Trading в Telegram</p><ul><li>Только Day Trading.</li><li>Активация подтверждается вручную.</li><li>Swing и Options обновляются на сайте.</li></ul><a class="vx-price-btn primary" data-vx-funnel-kind="trial" data-vx-funnel-system="day-trading" data-vx-funnel-offer="day-trial" href="' + esc(offer.DAY_TRIAL_URL) + '" target="_blank" rel="noopener noreferrer">30 дней бесплатно</a></article>' +
        '<article class="vx-price-card single"><div class="vx-price-kicker">ОДНА СИСТЕМА</div><h2>$49<small>/месяц</small></h2><p class="vx-price-sub">Day Trading, Swing Trading или Options</p><div class="vx-price-system-list">' + singleChoices + '</div><p class="vx-price-note">Day Trading: Telegram + активность на сайте. Swing и Options: обновления на сайте.</p></article>' +
        '<article class="vx-price-card bundle"><div class="vx-price-kicker">ПАКЕТ ИЗ ТРЁХ СИСТЕМ</div><h2>$99<small>/месяц</small></h2><p class="vx-price-sub">Day Trading + Swing Trading + Options</p><ul><li>Ровно три системы Vixale.</li><li>Три отдельных плана стоят $147/месяц.</li><li>Экономия $48/месяц.</li></ul><a class="vx-price-btn primary" data-vx-funnel-kind="pricing_plan" data-vx-funnel-offer="three-system-bundle" href="' + esc(offer.BUNDLE_REQUEST_URL) + '" target="_blank" rel="noopener noreferrer">Запросить пакет — $99/месяц</a></article>' +
      '</section>' +
      '<section class="vx-price-process" aria-labelledby="vx-price-process-title"><span>КАК ПОДКЛЮЧИТЬСЯ</span><h2 id="vx-price-process-title">Как подключиться</h2><p class="vx-price-how-copy">Выберите план и отправьте подготовленное сообщение в Telegram. Мы ответим с инструкциями по оплате и доступу.</p><div class="vx-price-process-grid"><div><b>1</b><strong>Выберите план</strong><p>Пробный Day Trading, одна система или пакет.</p></div><div><b>2</b><strong>Отправьте запрос</strong><p>В Telegram откроется подготовленное сообщение с выбранным предложением.</p></div><div><b>3</b><strong>Получите инструкции</strong><p>Оплата и доступ подтверждаются в ручном процессе подключения.</p></div></div></section>' +
      '<aside class="vx-price-separate"><div><strong>Бесплатный viewer-доступ — отдельный процесс.</strong><span>Он даёт read-only доступ только к тем защищённым материалам, на которые вы одобрены.</span></div><a data-vx-funnel-kind="viewer" data-vx-funnel-offer="viewer-access" href="/access">Запросить бесплатный viewer-доступ</a></aside>' +
      '<div class="vx-price-disclosure">Торговля связана с риском, результаты не гарантированы. Активация и оплата не происходят автоматически при нажатии кнопки.</div>' +
    '</div>';
  }

  return '<div class="vx-conversion-pricing" data-vx-conversion-pricing="1">' +
    '<section class="vx-price-hero"><span>PRICING</span><h1>Choose one system or follow all three.</h1><p>The free trial covers Day Trading Telegram signals only. Day Trading, Swing Trading, and Options are $49/month each; the Three-System Bundle is $99/month.</p></section>' +
    '<section class="vx-price-grid" aria-label="Vixale plans">' +
      '<article class="vx-price-card trial"><div class="vx-price-kicker">DAY TRADING TRIAL</div><h2>30 days free</h2><p class="vx-price-sub">Day Trading Telegram signals</p><ul><li>Day Trading signals only.</li><li>Activation is confirmed manually.</li><li>Swing Trading and Options are website-update products.</li></ul><a class="vx-price-btn primary" data-vx-funnel-kind="trial" data-vx-funnel-system="day-trading" data-vx-funnel-offer="day-trial" href="' + esc(offer.DAY_TRIAL_URL) + '" target="_blank" rel="noopener noreferrer">Get 30 Days Free</a></article>' +
      '<article class="vx-price-card single"><div class="vx-price-kicker">SINGLE SYSTEM</div><h2>$49<small>/month</small></h2><p class="vx-price-sub">Choose Day Trading, Swing Trading, or Options</p><div class="vx-price-system-list">' + singleChoices + '</div><p class="vx-price-note">Day Trading: Telegram signals and website activity. Swing Trading and Options: website updates.</p></article>' +
      '<article class="vx-price-card bundle"><div class="vx-price-kicker">THREE-SYSTEM BUNDLE</div><h2>$99<small>/month</small></h2><p class="vx-price-sub">Day Trading + Swing Trading + Options</p><ul><li>Exactly the three Vixale systems.</li><li>Three separate plans total $147/month.</li><li>Save $48/month.</li></ul><a class="vx-price-btn primary" data-vx-funnel-kind="pricing_plan" data-vx-funnel-offer="three-system-bundle" href="' + esc(offer.BUNDLE_REQUEST_URL) + '" target="_blank" rel="noopener noreferrer">Request the Bundle — $99/month</a></article>' +
    '</section>' +
    '<section class="vx-price-process" aria-labelledby="vx-price-process-title"><span>HOW TO JOIN</span><h2 id="vx-price-process-title">How to join</h2><p class="vx-price-how-copy">Choose your plan and send us the prepared Telegram message. We’ll reply with payment and access instructions.</p><div class="vx-price-process-grid"><div><b>1</b><strong>Choose a plan</strong><p>Select the Day Trading trial, one system, or the bundle.</p></div><div><b>2</b><strong>Send the request</strong><p>Telegram opens with the selected offer already identified.</p></div><div><b>3</b><strong>Receive instructions</strong><p>Payment and access are confirmed through the established manual onboarding process.</p></div></div></section>' +
    '<aside class="vx-price-separate"><div><strong>Free viewer access is separate.</strong><span>It provides read-only access only to protected views for which you are approved.</span></div><a data-vx-funnel-kind="viewer" data-vx-funnel-offer="viewer-access" href="/access">Request Free Viewer Access</a></aside>' +
    '<div class="vx-price-disclosure">Trading involves risk and results are not guaranteed. Clicking a request does not automatically activate a trial, charge a payment method, or approve viewer access.</div>' +
  '</div>';
}

function replaceMain(html, inner) {
  const start = String(html || "").search(/<main\b/i);
  const range = tagRange(html, "main", start);
  return range ? replaceInner(html, range, "\n" + inner + "\n") : html;
}

function refinePricing(html, locale, selectedKey) {
  return replaceMain(html, renderPricing(locale, selectedKey));
}

function resultsAction(locale, system) {
  const c = copy(locale);
  if (system === "day-trading") {
    return '<div class="vx-results-next-action"><a data-vx-funnel-kind="trial" data-vx-funnel-system="day-trading" data-vx-funnel-offer="day-trial" href="' + esc(offer.DAY_TRIAL_URL) + '" target="_blank" rel="noopener noreferrer">' + c.trial + "</a></div>";
  }
  const item = offer.systemOffer(system);
  const label = system === "options" ? c.paidOptions : c.paidSwing;
  return '<div class="vx-results-next-action"><a data-vx-funnel-kind="subscription" data-vx-funnel-system="' + system + '" data-vx-funnel-offer="single-system" href="' + esc(item.subscription_request_url) + '" target="_blank" rel="noopener noreferrer">' + label + "</a></div>";
}

function refineResults(html, locale) {
  let out = html;
  out = out.split("Detailed Options journal rows and brokerage proofs remain protected.").join("The Options performance chart and Option Journal are public; brokerage proof files remain protected under existing viewer permissions.");
  out = out.split("OPTIONS · OWNER-ENTERED / REALIZED").join(locale === "ru" ? "OPTIONS · ЗАФИКСИРОВАННЫЕ РЕЗУЛЬТАТЫ" : "OPTIONS · RECORDED RESULTS");
  out = out.split("Options Trading results").join(copy(locale).recordedOptions);
  for (const id of ["day-trading", "swing-trading", "options"]) {
    const range = rangeById(out, "article", id);
    if (range && !out.slice(range.start, range.end).includes("vx-results-next-action")) {
      out = appendInside(out, range, resultsAction(locale, id));
    }
  }
  return out;
}

function refineAccess(html, locale) {
  let out = html;
  const c = copy(locale);
  const facts = locale === "ru"
    ? "Одобренный viewer-доступ открывает read-only защищённые материалы, на которые вы получили право, включая детали Day Trading dashboard и доступные защищённые брокерские файлы Options. Публичные график и Option Journal Options, а также публичный Swing Portfolio не требуют входа."
    : "Approved viewer access opens read-only protected detail for which you are entitled, including Day Trading dashboard detail and protected Options brokerage proof files where available. The public Options chart and Option Journal and the public Swing model portfolio do not require login.";
  out = out.replace(/Approved viewer access opens the read-only Day Trading dashboard and the protected Options viewer\. The Swing research\/model portfolio is already public and does not require login\./g, facts);
  out = out.replace(/Legacy links to <code>\/#password-access<\/code> remain supported\./g, "");
  out = out.replace(/Existing approved viewer\? <a href="\/login">Log In with your viewer code<\/a>\.\s*/g, 'Existing approved viewer? <a href="/login">' + c.login + " with your viewer code</a>. ");
  return out;
}

function renderGuideOptions(locale) {
  const c = copy(locale);
  if (locale === "ru") {
    return '<section class="section" id="options" aria-labelledby="vx-guide-options-title"><div class="wrap"><div class="section-head"><div><div class="kicker">Options · Публикуемый процесс</div><h2 id="vx-guide-options-title">Следите за опубликованной позицией от входа до результата.</h2></div><p>Options обновляется на сайте и не ограничен одной структурой. Публичные график результатов и Option Journal показывают торговую историю; брокерские файлы остаются защищёнными.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps"><div class="guide-step"><span>1</span><div><strong>Откройте опубликованную позицию</strong><p>Смотрите детали позиции в Options на сайте.</p></div></div><div class="guide-step"><span>2</span><div><strong>Следите за обновлениями</strong><p>Проверяйте опубликованный статус и изменения позиции.</p></div></div><div class="guide-step"><span>3</span><div><strong>Просмотрите результат</strong><p>После закрытия сделки проверьте зафиксированный результат в Option Journal.</p></div></div><div class="guide-step"><span>4</span><div><strong>При необходимости запросите viewer-доступ</strong><p>Viewer-доступ нужен только для защищённых материалов, например доступных брокерских файлов.</p></div></div></div></article><aside class="example"><h3>Доступ и тариф</h3><div class="rows"><div class="row"><span>Options</span><b>$49/месяц</b></div><div class="row"><span>Обновления</span><b>Сайт</b></div><div class="row"><span>График и журнал</span><b>Публично</b></div><div class="row"><span>Брокерские файлы</span><b>Защищено</b></div></div><div class="vx-guide-actions" style="margin-top:14px"><a class="vx-guide-btn primary" data-vx-funnel-kind="subscription" data-vx-funnel-system="options" data-vx-funnel-offer="single-system" href="' + esc(offer.systemOffer("options").subscription_request_url) + '" target="_blank" rel="noopener noreferrer">' + c.paidOptions + '</a><a class="vx-guide-btn" data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="/access?system=options">' + c.viewer + "</a></div></aside></div></div></section>";
  }
  return '<section class="section" id="options" aria-labelledby="vx-guide-options-title"><div class="wrap"><div class="section-head"><div><div class="kicker">Options · Published workflow</div><h2 id="vx-guide-options-title">Follow a published position from entry to recorded result.</h2></div><p>Options is updated on the website and is not restricted to one trade structure. The public performance chart and Option Journal show the trade record; brokerage proof files remain protected.</p></div><div class="guide-grid"><article class="guide-card"><div class="guide-steps"><div class="guide-step"><span>1</span><div><strong>Read the published position</strong><p>Review the position details on the Options page.</p></div></div><div class="guide-step"><span>2</span><div><strong>Follow website updates</strong><p>Check the published status as the position changes.</p></div></div><div class="guide-step"><span>3</span><div><strong>Review the recorded result</strong><p>After the trade closes, review its recorded result in the public Option Journal.</p></div></div><div class="guide-step"><span>4</span><div><strong>Request viewer access only when needed</strong><p>Viewer access is for protected detail such as available brokerage proof files.</p></div></div></div></article><aside class="example"><h3>Access &amp; pricing</h3><div class="rows"><div class="row"><span>Options</span><b>$49/month</b></div><div class="row"><span>Updates</span><b>Website</b></div><div class="row"><span>Chart &amp; journal</span><b>Public</b></div><div class="row"><span>Brokerage proof files</span><b>Protected</b></div></div><div class="vx-guide-actions" style="margin-top:14px"><a class="vx-guide-btn primary" data-vx-funnel-kind="subscription" data-vx-funnel-system="options" data-vx-funnel-offer="single-system" href="' + esc(offer.systemOffer("options").subscription_request_url) + '" target="_blank" rel="noopener noreferrer">' + c.paidOptions + '</a><a class="vx-guide-btn" data-vx-funnel-kind="viewer" data-vx-funnel-system="options" data-vx-funnel-offer="viewer-access" href="/access?system=options">' + c.viewer + "</a></div></aside></div></div></section>";
}

function refineGuide(html, locale) {
  let out = html;
  const options = rangeById(out, "section", "options");
  if (options) out = replaceRange(out, options, renderGuideOptions(locale));
  out = out.split("Protected journal → Daily updates → Closed evidence").join(locale === "ru" ? "Позиция → Обновления на сайте → Зафиксированный результат" : "Published position → Website updates → Recorded result");
  out = out.split("Options · Protected workflow").join(locale === "ru" ? "Options · Публикуемый процесс" : "Options · Published workflow");
  out = out.split("Options remains a website-update product in this release.").join(locale === "ru" ? "Обновления Options публикуются на сайте." : "Options updates are published on the website.");
  return out;
}

function refineCrossPageCopy(html, locale) {
  let out = html;
  const replacements = [
    ["Options: journal-based evidence with protected detail.", "Options: published positions, daily website updates, and recorded results."],
    ["Public visitors can understand what the journal contains without exposing protected journal rows or proofs.", "Public visitors can review the Options performance chart and Option Journal. Brokerage proof files remain protected for approved viewers."],
    ["Approved viewer access opens the protected Options viewer.", "Approved viewer access is for protected Options detail such as available brokerage proof files; the public chart and Option Journal do not require it."],
    ["Options uses the owner-entered Option Journal; protected details remain in the Options viewer.", "Options uses the owner-entered Option Journal; the chart and journal are public while brokerage proof files remain protected."],
    ["protected journal rows, closed-position details and supporting brokerage records remain behind existing viewer access", "the performance chart and Option Journal are public; brokerage proof files remain behind existing viewer access"],
    ["Protected journal", "Published Option Journal"],
    ["protected position history", "public Option Journal"],
    ["actively managed options 0DTE system", "options positions and published daily updates"],
    ["Get Day Trading Signals", copy(locale).exploreDay],
    ["Get options signals", copy(locale).exploreOptions],
    ["Live Access", copy(locale).viewer],
  ];
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out;
}

const styles = '<style id="' + STYLE_ID + '">' +
  'html{scroll-padding-top:112px}' +
  '[id]{scroll-margin-top:112px}' +
  '#password-access{scroll-margin-top:140px!important}' +
  '.vx-home-viewer-link{display:inline-flex;margin-top:12px;color:#176442;font-size:12.5px;font-weight:750;text-decoration:none}.vx-home-viewer-link:hover{text-decoration:underline;text-underline-offset:3px}' +
  '.vx-results-next-action{display:flex;margin-top:18px}.vx-results-next-action a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:#078f51;color:#fff;text-decoration:none;font-size:12px;font-weight:750}' +
  '.vx-options-viewer-request{display:inline-flex;align-items:center;justify-content:center;min-height:43px;margin:23px 0 0 10px;padding:0 16px;border:1px solid #c7d8cf;border-radius:999px;color:#176442;text-decoration:none;font-size:12.5px;font-weight:750}.vx-options-viewer-action{border-color:#c7d8cf!important;background:#fff!important;color:#176442!important}' +
  '.vx-price-how-copy{max-width:780px;margin:10px 0 0;color:#5f6d67;font-size:13px;line-height:1.55}' +
  '.vx-options-benefit-card{padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.05)}' +
  '@media(min-width:1001px){.vx-unified-public-nav{gap:clamp(12px,1.5vw,22px)!important}.nav-links,.navlinks{column-gap:18px!important}.vx-unified-public-nav a{font-size:14px!important}.vx-direct-nav-actions{gap:12px!important}.vx-public-nav-cta{min-height:46px!important;padding:0 18px!important}}' +
  '@media(max-width:1000px){html{scroll-padding-top:150px}[id]{scroll-margin-top:150px}.vx-unified-public-nav{order:3!important;flex:1 1 100%!important;width:100%!important;padding-top:5px!important}.vx-direct-nav-actions{order:2!important}.vx-unified-public-nav a:nth-child(-n+3){font-weight:700!important}}' +
  '@media(max-width:700px){.vx-unified-public-nav{flex-wrap:nowrap!important;overflow-x:auto!important;gap:14px!important}.vx-unified-public-nav a{flex:0 0 auto!important}.vx-public-nav-cta{padding:0 13px!important}.vx-options-viewer-request{margin-left:0;width:100%;box-sizing:border-box}.vx-results-next-action a{width:100%;box-sizing:border-box}}' +
  '</style>';

const funnelScript = '<script id="' + SCRIPT_ID + '">(function(){' +
  'if(window.__vxOct6FunnelBound)return;window.__vxOct6FunnelBound=true;' +
  'document.addEventListener("click",function(event){var node=event.target&&event.target.closest?event.target.closest("[data-vx-funnel-kind]"):null;if(!node)return;' +
  'var q=new URLSearchParams();["kind","system","offer"].forEach(function(k){var v=node.getAttribute("data-vx-funnel-"+k);if(v)q.set(k,v)});q.set("origin",location.pathname);var url="/website-funnel/cta?"+q.toString();' +
  'try{if(navigator.sendBeacon){navigator.sendBeacon(url,"");return}fetch(url,{method:"POST",credentials:"same-origin",keepalive:true}).catch(function(){})}catch(_){}} ,true);' +
  '})();</script>';

function injectAssets(html) {
  let out = html;
  if (!out.includes('id="' + STYLE_ID + '"')) out = out.includes("</head>") ? out.replace("</head>", styles + "\n</head>") : styles + out;
  if (out.includes("data-vx-funnel-kind=") && !out.includes('id="' + SCRIPT_ID + '"')) {
    out = out.includes("</body>") ? out.replace("</body>", funnelScript + "\n</body>") : out + funnelScript;
  }
  return out;
}

function refineHtml(html, path, locale, query = {}) {
  if (typeof html !== "string") return html;
  let out = refineNavigation(html, path, locale);
  if (path === "/") out = refineHome(out, locale);
  if (path === "/trading-systems/options") out = refineOptions(out, locale);
  if (path === "/pricing") out = refinePricing(out, locale, query.system);
  if (path === "/results") out = refineResults(out, locale);
  if (path === "/access") out = refineAccess(out, locale);
  if (path === "/trading-guide") out = refineGuide(out, locale);
  out = refineCrossPageCopy(out, locale);
  return injectAssets(out);
}

function install(app) {
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const path = requestPath(req);
    if ((method !== "GET" && method !== "HEAD") || !isPublicPath(path)) return next();
    const locale = requestLocale(req);
    const send = res.send.bind(res);
    res.send = function sendWithOct6UserFriendliness(body) {
      const type = String(res.getHeader?.("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html")) && res.statusCode < 300) {
        body = refineHtml(body, path, locale, req.query || {});
      }
      return send(body);
    };
    return next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(factory) {
  if (typeof factory !== "function" || factory.__vixaleOct6UserFriendlinessWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    install(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleOct6UserFriendlinessWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleOct6UserFriendlinessModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  STYLE_ID,
  SCRIPT_ID,
  PUBLIC_PATHS,
  requestPath,
  requestLocale,
  isPublicPath,
  tagRange,
  rangeByClass,
  rangeById,
  renderPrimaryNavigation,
  renderNavigationActions,
  renderSecondaryNavigation,
  refineNavigation,
  renderHomeHeroCopy,
  renderHomeCards,
  renderHomeOptionsState,
  refineHome,
  refineOptions,
  renderPricing,
  refinePricing,
  refineResults,
  refineAccess,
  renderGuideOptions,
  refineGuide,
  refineCrossPageCopy,
  injectAssets,
  refineHtml,
  install,
  wrapExpress,
};
