"use strict";

const OVERVIEW_PATH = "/trading-systems/swing-trading/overview";
const PORTFOLIO_PATH = "/trading-systems/swing-trading";

const COPY = {
  en: {
    label: "Swing Trading",
    title: "Follow a multi-session model portfolio.",
    summary: "Vixale publishes Swing portfolio updates on its website. The portfolio tracks selected stocks, changes to positions, and model equity over time.",
    evidence: "The model portfolio is research. Its history describes model performance and is separate from broker executions.",
    access: "An approved viewer code opens the Active Portfolio, candidates, closed trades, and model equity history.",
    signIn: "Log in to view portfolio",
    overview: "Explore Swing Trading",
    request: "Request viewer access",
    portfolioHeading: "Swing model portfolio",
    badge: "VIEWER ACCESS",
  },
  ru: {
    label: "Свинг-трейдинг",
    title: "Следите за модельным портфелем на несколько сессий.",
    summary: "Vixale публикует обновления свинг-портфеля на сайте. В портфеле можно отслеживать отобранные акции, изменения позиций и динамику модельного капитала.",
    evidence: "Модельный портфель предназначен для исследований. Его история показывает результат модели отдельно от брокерских сделок.",
    access: "Код доступа открывает активный портфель, список кандидатов, закрытые сделки и историю модельного капитала.",
    signIn: "Войти и открыть портфель",
    overview: "О свинг-трейдинге",
    request: "Запросить доступ для просмотра",
    portfolioHeading: "Модельный свинг-портфель",
    badge: "ДОСТУП ДЛЯ ПРОСМОТРА",
  },
};

function renderOverview(locale) {
  const c = COPY[locale] || COPY.en;
  return `<section class="vx-swing-overview"><p class="vx-page-kicker">${c.label}</p>
    <h1>${c.title}</h1><p>${c.summary}</p><p>${c.evidence}</p>
    <section aria-labelledby="vx-swing-viewer-title"><h2 id="vx-swing-viewer-title">${c.badge}</h2>
      <p>${c.access}</p><div class="vx-public-action-row">
        <a class="vx-public-action vx-public-action-primary" href="${PORTFOLIO_PATH}">${c.signIn}</a>
        <a class="vx-public-action" href="/access?system=swing-trading">${c.request}</a>
      </div>
    </section>
  </section>`;
}

module.exports = { OVERVIEW_PATH, PORTFOLIO_PATH, COPY, renderOverview };
