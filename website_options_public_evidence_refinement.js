"use strict";

const Module = require("module");

const OPTIONS_PATH = "/trading-systems/options";
const HOME_PATH = "/";
const ACCESS_HREF = "/#password-access";
const OPTION_JOURNAL_RANGE = "'Option Journal'!A:S";
const OPTION_PROOFS_RANGE = "'Option Proofs'!A2:G";
const STYLE_ID = "vx-options-public-evidence-style";
const PAGE_MARKER = 'data-vx-options-public-evidence="1"';
const CACHE_TTL_MS = 5 * 60 * 1000;

let evidenceCache = { expiresAt: 0, value: null, inFlight: null };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "/").split("?")[0] || "/";
}

function normalizeHost(value) {
  return String(value || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function requestLocale(req) {
  const host = normalizeHost(req?.get?.("host") || req?.headers?.host || req?.headers?.["x-forwarded-host"] || "");
  return host === "ru.vixale.com" ? "ru" : "en";
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function optionTradeFromRow(row = []) {
  return {
    id: String(row[0] || ""),
    trade_date: String(row[1] || ""),
    entry_time: String(row[2] || ""),
    symbol: String(row[3] || ""),
    strategy: String(row[4] || ""),
    legs: String(row[5] || ""),
    expiration: String(row[6] || ""),
    contracts: Number(row[7] || 0),
    multiplier: Number(row[8] || 100),
    trade_type: String(row[9] || ""),
    entry_price: row[10] == null || row[10] === "" ? "" : Number(row[10]),
    exit_date: String(row[11] || ""),
    exit_time: String(row[12] || ""),
    exit_price: row[13] == null || row[13] === "" ? "" : Number(row[13]),
    fees: Number(row[14] || 0),
    status: String(row[15] || ""),
  };
}

function parseOptionJournalRows(values) {
  const rows = Array.isArray(values) ? values : [];
  const start = rows.length && String(rows[0]?.[0] || "").trim().toUpperCase() === "ID" ? 1 : 0;
  return rows
    .slice(start)
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? "").trim() !== ""))
    .map(optionTradeFromRow);
}

function optionPnl(trade) {
  if (!trade || String(trade.status || "").toLowerCase() !== "closed" || trade.exit_price === "" || trade.entry_price === "") return null;
  const fields = [trade.entry_price, trade.exit_price, trade.contracts, trade.multiplier, trade.fees];
  if (fields.some(value => !Number.isFinite(Number(value)))) return null;
  const difference = String(trade.trade_type || "").toLowerCase() === "credit"
    ? Number(trade.entry_price) - Number(trade.exit_price)
    : Number(trade.exit_price) - Number(trade.entry_price);
  const pnl = difference * Number(trade.contracts) * Number(trade.multiplier) - Number(trade.fees);
  return Number.isFinite(pnl) ? roundMoney(pnl) : null;
}

function buildOptionsEquityCurve(trades) {
  const daily = new Map();
  for (const trade of Array.isArray(trades) ? trades : []) {
    if (String(trade.status || "").toLowerCase() !== "closed" || !/^\d{4}-\d{2}-\d{2}$/.test(String(trade.exit_date || ""))) continue;
    const pnl = optionPnl(trade);
    if (pnl == null) continue;
    daily.set(trade.exit_date, roundMoney((daily.get(trade.exit_date) || 0) + pnl));
  }
  let cumulative = 0;
  const points = [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dailyPnl]) => {
      cumulative = roundMoney(cumulative + dailyPnl);
      return { date, daily_pnl: dailyPnl, cumulative_pnl: cumulative };
    });
  return { points, total_realized_pnl: points.length ? points[points.length - 1].cumulative_pnl : 0 };
}

function buildPublicOptionsEvidence(values, proofValues = []) {
  const trades = parseOptionJournalRows(values);
  // Reuse the admin journal's separate proof association; never retain storage metadata.
  const uuid = /^[0-9a-f-]{36}$/i;
  for (const trade of trades) {
    trade.proof_ids = uuid.test(trade.id) ? [...new Set(proofValues
      .filter(row => Array.isArray(row) && row[1] === trade.id && uuid.test(String(row[0] || "")) && row[2])
      .map(row => String(row[0])))] : [];
  }
  return { trades, curve: buildOptionsEquityCurve(trades) };
}

async function loadPublicOptionsEvidenceFromSheets() {
  const spreadsheetId = String(process.env.GOOGLE_SHEET_ID || "").trim();
  const credentialsJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!spreadsheetId || !credentialsJson) throw new Error("Options public evidence source is not configured");
  const { google } = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: OPTION_JOURNAL_RANGE });
  let proofValues = [];
  let proofError = false;
  try {
    const proofs = await sheets.spreadsheets.values.get({ spreadsheetId, range: OPTION_PROOFS_RANGE });
    proofValues = proofs.data.values || [];
  } catch (_) {
    // A missing/unavailable proof sheet must not hide the trade history or trigger writes.
    proofError = true;
  }
  return { ...buildPublicOptionsEvidence(response.data.values || [], proofValues), proof_error: proofError };
}

async function loadCachedPublicOptionsEvidence(loader = loadPublicOptionsEvidenceFromSheets) {
  const now = Date.now();
  if (evidenceCache.value && evidenceCache.expiresAt > now) return evidenceCache.value;
  if (evidenceCache.inFlight) return evidenceCache.inFlight;
  evidenceCache.inFlight = Promise.resolve()
    .then(loader)
    .then(value => {
      evidenceCache = { value, expiresAt: Date.now() + CACHE_TTL_MS, inFlight: null };
      return value;
    })
    .catch(error => {
      evidenceCache.inFlight = null;
      throw error;
    });
  return evidenceCache.inFlight;
}

function resetEvidenceCache() {
  evidenceCache = { expiresAt: 0, value: null, inFlight: null };
}

function formatMoney(value, sign = true) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const prefix = sign ? (number > 0 ? "+" : number < 0 ? "-" : "") : (number < 0 ? "-" : "");
  return `${prefix}$${Math.abs(number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPrice(value) {
  if (value === "" || !Number.isFinite(Number(value))) return "—";
  return `$${Math.abs(Number(value)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactChartSvg(points) {
  const safe = Array.isArray(points) ? points.filter(point => Number.isFinite(Number(point?.cumulative_pnl))) : [];
  if (!safe.length) return "";
  const width = 360;
  const height = 160;
  const margin = { top: 14, right: 30, bottom: 30, left: 65 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = safe.map(point => Number(point.cumulative_pnl));
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const rawStep = (max - min || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find(value => value >= rawStep / magnitude) * magnitude;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  if (min === max) max = min + step * 4;
  const span = max - min || 1;
  const x = index => safe.length === 1 ? margin.left + plotWidth / 2 : margin.left + (index / (safe.length - 1)) * plotWidth;
  const y = value => margin.top + ((max - value) / span) * plotHeight;
  const grid = [];
  for (let value = min; value <= max + step / 100; value += step) {
    const tick = Math.abs(value) < step / 100 ? 0 : value;
    const label = `${tick < 0 ? "-" : ""}$${Math.abs(tick).toLocaleString("en-US", { maximumFractionDigits: 2, notation: Math.abs(tick) >= 100000 ? "compact" : "standard" })}`;
    grid.push(`<line class="vx-options-grid${tick === 0 ? " vx-options-zero" : ""}" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick).toFixed(2)}" y2="${y(tick).toFixed(2)}" stroke-dasharray="4 4"></line><text class="vx-options-y-tick" x="${margin.left - 8}" y="${(y(tick) + 4).toFixed(2)}" text-anchor="end">${label}</text>`);
  }
  const tickIndices = [...new Set(Array.from({ length: Math.min(4, safe.length) }, (_, index) => Math.round(index * (safe.length - 1) / (Math.min(4, safe.length) - 1 || 1))))];
  const dates = tickIndices.map(index => `<text class="vx-options-x-tick" x="${x(index).toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeHtml(String(safe[index].date).slice(5).replace("-", "/"))}</text>`).join("");
  const polyline = safe.map((point, index) => `${x(index).toFixed(2)},${y(Number(point.cumulative_pnl)).toFixed(2)}`).join(" ");
  const circles = safe.length <= 24
    ? safe.map((point, index) => `<circle cx="${x(index).toFixed(2)}" cy="${y(Number(point.cumulative_pnl)).toFixed(2)}" r="3.2"><title>${escapeHtml(point.date)} · ${escapeHtml(formatMoney(point.cumulative_pnl))}</title></circle>`).join("")
    : "";
  return `<svg class="vx-options-public-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Options cumulative realized profit and loss"><title>Options realized P&amp;L in dollars by exit date</title>${grid.join("")}${dates}<polyline points="${polyline}"></polyline>${circles}</svg>`;
}

function renderCompactChart(evidence, locale = "en", error = false) {
  const ru = locale === "ru";
  const curve = evidence?.curve || { points: [], total_realized_pnl: 0 };
  const points = Array.isArray(curve.points) ? curve.points : [];
  const svg = compactChartSvg(points);
  const hasTotal = !error && points.length > 0 && Number.isFinite(Number(curve.total_realized_pnl));
  const total = hasTotal ? Number(curve.total_realized_pnl) : null;
  const unavailable = error
    ? (ru ? "История результатов временно недоступна." : "Options performance history is temporarily unavailable.")
    : (ru ? "Пока нет закрытых сделок с корректным реализованным P&L." : "No closed trades with valid realized P&L yet.");
  return `<div class="vx-options-public-chart" id="options-public-chart">
    <div class="vx-options-public-chart-head"><div><span>${ru ? "РЕЗУЛЬТАТЫ OPTIONS" : "OPTIONS PERFORMANCE"}</span><strong>${ru ? "Кривая реализованного P&L" : "Realized P&L curve"}</strong><small>${ru ? "Закрытые сделки Option Journal · по дате выхода" : "Closed Option Journal trades · grouped by Exit Date"}</small></div><div class="vx-options-public-chart-total"><span>${ru ? "Итого" : "Total realized"}</span><b class="${total == null ? "" : total < 0 ? "negative" : "positive"}">${total == null ? "—" : formatMoney(total)}</b></div></div>
    ${svg || `<div class="vx-options-public-evidence-empty">${unavailable}</div>`}
  </div>`;
}

function publicProofCell(trade, locale) {
  const uuid = /^[0-9a-f-]{36}$/i;
  const ids = uuid.test(trade.id) && Array.isArray(trade.proof_ids)
    ? trade.proof_ids.filter(id => uuid.test(id)) : [];
  if (!ids.length) return "—";
  const ru = locale === "ru";
  const label = ids.length === 1 ? (ru ? "Смотреть" : "View Proof") : (ru ? "Подтверждения" : "View Proofs");
  const links = ids.map((id, index) => `<a class="vx-options-proof-pill" href="/dashboard/options/${encodeURIComponent(trade.id)}/proofs/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">${ids.length === 1 ? label : `${ru ? "Файл" : "Proof"} ${index + 1}`}</a>`).join("");
  return ids.length === 1 ? links : `<details class="vx-options-proof-list"><summary class="vx-options-proof-pill">${label}</summary>${links}</details>`;
}

function journalRows(trades, locale = "en") {
  const ru = locale === "ru";
  const list = Array.isArray(trades) ? [...trades] : [];
  list.sort((left, right) => {
    const a = `${left.trade_date || ""} ${left.entry_time || ""}`;
    const b = `${right.trade_date || ""} ${right.entry_time || ""}`;
    return b.localeCompare(a);
  });
  return list.map((trade, index) => {
    const pnl = optionPnl(trade);
    const status = trade.status || (trade.exit_date ? (ru ? "Закрыта" : "Closed") : (ru ? "Открыта" : "Open"));
    const labels = journalHeaders(locale);
    const cell = (i, value, cls = "") => `<td data-label="${labels[i]}" class="${cls}">${value}</td>`;
    return `<tr${index >= 8 ? ' data-options-older hidden' : ''}>
      ${cell(0, escapeHtml(trade.trade_date || "—"))}
      ${cell(1, `<strong>${escapeHtml(trade.symbol || "—")}</strong>`)}
      ${cell(2, escapeHtml(trade.strategy || "—"))}
      ${cell(3, escapeHtml(trade.legs || "—"), "vx-options-public-legs")}
      ${cell(4, escapeHtml(trade.expiration || "—"))}
      ${cell(5, Number.isFinite(Number(trade.contracts)) && Number(trade.contracts) > 0 ? escapeHtml(trade.contracts) : "—")}
      ${cell(6, escapeHtml(trade.trade_type || "—"))}
      ${cell(7, formatPrice(trade.entry_price))}
      ${cell(8, formatPrice(trade.exit_price))}
      ${cell(9, `<span class="vx-options-public-status">${escapeHtml(status)}</span>`)}
      ${cell(10, pnl == null ? "—" : formatMoney(pnl), pnl == null ? "" : pnl < 0 ? "negative" : "positive")}
      ${cell(11, publicProofCell(trade, locale))}
    </tr>`;
  }).join("");
}

function journalHeaders(locale) {
  return locale === "ru"
    ? ["Дата входа", "Тикер", "Стратегия", "Ноги", "Экспирация", "Контр.", "Кредит/Дебет", "Цена входа", "Цена выхода", "Статус", "P&L", "Подтверждения"]
    : ["Entry Date", "Symbol", "Strategy", "Legs", "Expiration", "Contracts", "Credit/Debit", "Entry Price", "Exit Price", "Status", "P&L", "Proofs"];
}

function journalToggleScript() {
  const button = document.getElementById("vx-options-show-more");
  if (!button) return;
  button.addEventListener("click", function () {
    const expanded = button.getAttribute("aria-expanded") !== "true";
    document.querySelectorAll("#vx-options-trade-rows [data-options-older]").forEach(row => { row.hidden = !expanded; });
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? button.dataset.less : button.dataset.more;
  });
}

function renderPublicJournal(evidence, locale = "en", error = false) {
  const ru = locale === "ru";
  const trades = Array.isArray(evidence?.trades) ? evidence.trades : [];
  const body = error
    ? `<div class="vx-options-public-evidence-empty">${ru ? "Option Journal временно недоступен. Мы не подставляем имитационные данные." : "The Option Journal is temporarily unavailable. No simulated data is substituted."}</div>`
    : trades.length
      ? `<div class="vx-options-public-journal-scroll"><table><colgroup>${[8, 5.5, 9, 15, 8, 6, 7.5, 7, 7, 7, 9, 11].map(width => `<col style="width:${width}%">`).join("")}</colgroup><thead><tr>${journalHeaders(locale).map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody id="vx-options-trade-rows">${journalRows(trades, locale)}</tbody></table></div>${trades.length > 8 ? `<button type="button" class="vx-options-show-more" id="vx-options-show-more" aria-expanded="false" aria-controls="vx-options-trade-rows" data-more="${ru ? "Показать ещё сделки" : "Show more trades"}" data-less="${ru ? "Показать меньше" : "Show less"}">${ru ? "Показать ещё сделки" : "Show more trades"}</button><script>(${journalToggleScript.toString()})();</script><noscript><style>#vx-options-trade-rows [hidden]{display:table-row!important}#vx-options-show-more{display:none}</style></noscript>` : ""}`
      : `<div class="vx-options-public-evidence-empty">${ru ? "В Option Journal пока нет опубликованных сделок." : "No Option Journal trades have been published yet."}</div>`;
  return `<section class="vx-options-public-journal" id="option-journal-public" aria-labelledby="vx-options-public-journal-title">
    <div class="vx-options-public-journal-head"><div><span class="vx-options-kicker">OPTION JOURNAL</span><h2 id="vx-options-public-journal-title">${ru ? "Смотрите сделки, а не только итог." : "See the trades behind the results."}</h2><p>${ru ? "Публичный журнал показывает поля сделок, которые Vixale публикует из существующего Option Journal. Записи обновляются из того же источника; имитационные значения не используются." : "The public journal shows the trade fields Vixale publishes from the existing Option Journal. It refreshes from the same source, with no simulated replacement values."}</p></div><span class="vx-options-public-updated">${ru ? "Обновляется на сайте" : "Updated on the website"}</span></div>
    ${body}
    ${evidence?.proof_error ? `<p class="vx-options-public-proof-note">${ru ? "Доступность подтверждений временно не определена." : "Proof availability is temporarily unavailable."}</p>` : ""}
    <p class="vx-options-public-proof-note">${ru ? "Файлы брокерских подтверждений, если они доступны, остаются защищёнными и требуют одобренного viewer-доступа." : "Brokerage proof files, when available, remain protected and require approved viewer access."}</p>
  </section>`;
}

function tagRange(html, tag, start) {
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = re.exec(html))) {
    depth += new RegExp(`^<\\/${tag}\\b`, "i").test(match[0]) ? -1 : 1;
    if (depth === 0) return { start, end: re.lastIndex, openEnd: openEnd + 1, closeStart: match.index };
  }
  return null;
}

function elementRangeById(html, tag, id) {
  const re = new RegExp(`<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const match = re.exec(html);
  return match ? tagRange(html, tag, match.index) : null;
}

function replaceAnchorTarget(html, label, href = ACCESS_HREF) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<a\\b([^>]*)>${escaped}<\\/a>`, "gi");
  return html.replace(re, (_match, attrs) => {
    const clean = String(attrs || "")
      .replace(/\s+href=(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+target=(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+rel=(?:"[^"]*"|'[^']*')/gi, "");
    return `<a href="${href}"${clean}>${label}</a>`;
  });
}

function makeBenefitCardsClickable(html) {
  const match = /<div class="vx-options-benefit-grid">([\s\S]*?)<\/div>/.exec(html);
  if (!match) return html;
  const upgraded = match[1]
    .replace(/<article>/g, `<a class="vx-options-benefit-card" href="${ACCESS_HREF}">`)
    .replace(/<\/article>/g, "</a>");
  return html.slice(0, match.index) + `<div class="vx-options-benefit-grid">${upgraded}</div>` + html.slice(match.index + match[0].length);
}

function applyMarketingCopy(html, locale = "en") {
  let out = html;
  if (locale === "ru") {
    out = out
      .replace("Ниже показан реальный исторический пример из существующего Options dashboard с фактическими датами и полями журнала. Текущие открытые позиции здесь не раскрываются.", "Ниже показан реальный пример из Options dashboard с фактическими полями и датами сделок. Полный Option Journal опубликован ниже, чтобы вы могли проверить торговую историю напрямую.")
      .replace("Результаты входят в сервис.", "Реальные сделки. Ежедневные обновления. История, которую можно проверить.")
      .replace("Подписка включает доступ к истории закрытых сделок и доступным брокерским скриншотам, чтобы можно было смотреть не только последнее обновление, но и торговую историю.", `Эти результаты получены на нашем реальном торговом счёте. Мы ежедневно обновляем журнал опционных сделок — <a class="vx-options-proof-link" href="#option-journal-public">подтверждения</a> можно посмотреть в Option Journal ниже.`)
      .replace("Открытые позиции. Закрытые сделки. Зафиксированные результаты.", "Следите за сделкой от входа до выхода и проверяйте зафиксированный результат самостоятельно.")
      .replace("Платное подключение сейчас оформляется вручную через Vixale в Telegram. Кнопка открывает заранее заполненный запрос; детали активации, оплаты и доступа подтверждаются в процессе подключения.", "Начните с viewer-доступа Vixale: отправьте форму на главной странице, подтвердите email, и мы сообщим дальнейшие детали доступа и подключения.")
      .replace("В Options dashboard на нашем сайте.", "На этой странице Options в публичном Option Journal. Одобренные пользователи также могут открыть защищённый Options dashboard.")
      .replace("Да. Подписчики могут просматривать историю закрытых сделок и доступные подтверждающие брокерские скриншоты.", "Да. Публичный Option Journal показывает завершённые сделки и зафиксированный P/L; одобренные пользователи также могут открыть доступные защищённые брокерские скриншоты.");
  } else {
    out = out
      .replace("This is a real historical example from the existing Options dashboard, using actual journal fields and trade dates. Current open positions are not exposed in this public preview.", "This is a real example from the Options dashboard, using actual journal fields and trade dates. The full Option Journal is published below so you can review the trade record directly.")
      .replace("The results are part of the service.", "Real trades. Daily updates. A record you can check.")
      .replace("Your subscription includes access to our closed-trade history and available brokerage screenshots, so you can look beyond the latest update and review the trading record.", `These results come from our real trading account. We update the Options trade record daily, and you can review the <a class="vx-options-proof-link" href="#option-journal-public">proofs</a> in the Option Journal below.`)
      .replace("Open positions. Closed trades. Recorded results.", "Follow each trade from entry to exit, then review the recorded result for yourself.")
      .replace("Paid onboarding is currently handled manually through Vixale on Telegram. The button opens a pre-filled plan request; activation, payment, and access details are confirmed during onboarding.", "Start with Vixale viewer access: submit the form on the homepage, verify your email, and we’ll follow up with access and onboarding details.")
      .replace("In the options dashboard on our website.", "On this Options page in the public Option Journal. Approved viewers can also use the protected Options dashboard.")
      .replace("Yes. Subscribers can access the closed-trade history and available supporting brokerage screenshots.", "Yes. The public Option Journal shows completed trades and recorded P/L; approved viewers can also open available protected brokerage screenshots.");
  }
  return out;
}

function injectEvidenceIntoPreview(html, evidence, locale = "en", error = false) {
  const cardRange = elementRangeById(html, "div", "options-preview-card");
  if (!cardRange) return html;
  const card = html.slice(cardRange.start, cardRange.end);
  const stack = `<div class="vx-options-public-preview-stack">${renderCompactChart(evidence, locale, error)}${card}</div>`;
  let out = html.slice(0, cardRange.start) + stack + html.slice(cardRange.end);
  const previewRange = elementRangeById(out, "section", "options-dashboard-preview");
  if (!previewRange) return out;
  return out.slice(0, previewRange.end) + renderPublicJournal(evidence, locale, error) + out.slice(previewRange.end);
}

const styles = `<style id="${STYLE_ID}">
.vx-options-public-preview-stack{display:grid;gap:14px;min-width:0}.vx-options-public-chart{padding:15px 16px 12px;border:1px solid #cfe0d7;border-radius:18px;background:linear-gradient(145deg,#f6fbf8,#fff);box-shadow:0 10px 28px rgba(20,59,44,.05)}.vx-options-public-chart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.vx-options-public-chart-head>div:first-child>span{display:block;color:#287153;font-size:9px;font-weight:850;letter-spacing:.09em}.vx-options-public-chart-head strong{display:block;margin-top:3px;font-size:16px;font-weight:650;color:#17211d}.vx-options-public-chart-head small{display:block;margin-top:3px;color:#69766f;font-size:9.5px}.vx-options-public-chart-total{text-align:right;white-space:nowrap}.vx-options-public-chart-total span{display:block;color:#718079;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em}.vx-options-public-chart-total b{display:block;margin-top:4px;font-size:16px}.vx-options-public-chart .positive,.vx-options-public-journal .positive{color:#0a8f53}.vx-options-public-chart .negative,.vx-options-public-journal .negative{color:#b23a3a}.vx-options-public-chart-svg{display:block;width:100%;height:auto;margin-top:8px;overflow:visible}.vx-options-public-chart-svg line{stroke:#b8c9c0;stroke-width:1;stroke-dasharray:4 4}.vx-options-public-chart-svg polyline{fill:none;stroke:#0b8f54;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.vx-options-public-chart-svg circle{fill:#fff;stroke:#0b8f54;stroke-width:2}.vx-options-public-evidence-empty{padding:24px 14px;border:1px dashed #cbdad2;border-radius:12px;background:#f8fbf9;color:#68756f;text-align:center;font-size:12px}.vx-options-public-journal{margin:0 0 54px;padding:32px 0 0;border-top:1px solid #e1e9e5}.vx-options-public-journal-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:18px}.vx-options-public-journal-head h2{margin:8px 0 0;font-size:clamp(30px,4vw,44px);font-weight:540;line-height:1.05;letter-spacing:-.035em}.vx-options-public-journal-head p{max-width:760px;margin:13px 0 0;color:#596761;font-size:14px;line-height:1.6}.vx-options-public-updated{flex:0 0 auto;padding:7px 10px;border:1px solid #cae0d5;border-radius:999px;background:#f5fbf8;color:#226547;font-size:10px;font-weight:750}.vx-options-public-journal-scroll{overflow:visible;border:1px solid #dce7e1;border-radius:16px;background:#fff;box-shadow:0 12px 28px rgba(20,59,44,.04)}.vx-options-public-journal table{width:100%;min-width:0;border-collapse:collapse;font-size:11.5px}.vx-options-public-journal th{padding:11px 10px;background:#f3f8f5;color:#607068;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.055em;white-space:nowrap}.vx-options-public-journal td{padding:11px 10px;border-top:1px solid #edf2ef;color:#33413a;vertical-align:top}.vx-options-public-journal tbody tr:hover{background:#f9fcfa}.vx-options-public-journal td strong{font-weight:700;color:#17211d}.vx-options-public-journal td small{display:block;margin-top:3px;color:#809089;font-size:9px}.vx-options-public-legs{max-width:220px;white-space:normal}.vx-options-public-status{display:inline-block;padding:4px 7px;border-radius:999px;background:#eff7f3;color:#28674b;font-size:9.5px;font-weight:750}.vx-options-public-proof-note{margin:11px 0 0;color:#74817b;font-size:10.5px;line-height:1.5}.vx-options-benefit-grid a.vx-options-benefit-card{display:block;padding:20px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.05);color:inherit;text-decoration:none;transition:transform .16s ease,border-color .16s ease,background .16s ease}.vx-options-benefit-grid a.vx-options-benefit-card:hover,.vx-options-benefit-grid a.vx-options-benefit-card:focus-visible{transform:translateY(-2px);border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.08);outline:none}.vx-options-benefit-grid a.vx-options-benefit-card>span{color:#91cdb0;font-size:10px;font-weight:800}.vx-options-proof-link{color:#176442;font-weight:760;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}@media(max-width:720px){.vx-options-public-chart-head,.vx-options-public-journal-head{align-items:flex-start;flex-direction:column}.vx-options-public-chart-total{text-align:left}.vx-options-public-journal{margin-bottom:42px;padding-top:26px}.vx-options-public-journal-head{gap:12px}.vx-options-public-updated{align-self:flex-start}}
.vx-options-public-chart-svg text{fill:#64776c;font-size:14px;font-family:inherit}
.vx-options-public-chart-svg .vx-options-grid{stroke:#d6e1da;stroke-width:1}
.vx-options-public-chart-svg .vx-options-zero{stroke:#a4b9ac;stroke-width:1.2}
.vx-options-public-journal-scroll{overflow:visible}
.vx-options-public-journal table{min-width:0;table-layout:fixed;font-size:11px}
.vx-options-public-journal th{padding:10px 4px;font-size:9px;letter-spacing:0;white-space:normal;overflow-wrap:anywhere}
.vx-options-public-journal td{padding:10px 4px;overflow-wrap:anywhere}
.vx-options-public-journal td:first-child,.vx-options-public-journal td:nth-child(5){font-size:10px}
.vx-options-public-journal td strong{font-weight:500}
.vx-options-public-status{padding:3px 4px;font-weight:500;font-size:10px}
.vx-options-public-legs{white-space:normal}
.vx-options-proof-pill,.vx-options-show-more{display:inline-block;border:1px solid #c8ded1;border-radius:999px;background:#f0f8f3;color:#216746;font:inherit;text-decoration:none;cursor:pointer}
.vx-options-proof-pill{padding:4px 6px;font-size:10px;line-height:1.3;text-align:center}
.vx-options-proof-list summary{list-style:none}.vx-options-proof-list summary::-webkit-details-marker{display:none}
.vx-options-proof-list a{margin-top:5px}
.vx-options-show-more{display:block;margin:16px auto 0;padding:10px 18px;font-size:12px}
.vx-options-proof-pill:focus-visible,.vx-options-show-more:focus-visible{outline:2px solid #0b8f54;outline-offset:3px}
#vx-options-trade-rows [hidden]{display:none!important}
@media(max-width:760px){
 .vx-options-public-journal-scroll{border:0;background:transparent;box-shadow:none}
 .vx-options-public-journal table,.vx-options-public-journal tbody{display:block;width:100%}
 .vx-options-public-journal colgroup,.vx-options-public-journal thead{display:none}
 .vx-options-public-journal tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid #dce7e1;border-radius:12px;background:#fff;padding:8px;margin-bottom:12px}
 .vx-options-public-journal td,.vx-options-public-journal td:first-child,.vx-options-public-journal td:nth-child(5){display:block;padding:7px;font-size:12px;border:0;min-width:0;width:auto;max-width:none}
 .vx-options-public-journal td:before{content:attr(data-label);display:block;margin-bottom:4px;color:#718079;font-size:10px}
 .vx-options-proof-pill{font-size:12px;padding:8px 10px}
 .vx-options-public-status{font-size:12px}
}
</style>`;

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

function refinePublicOptionsPage(html, evidence, locale = "en", error = false) {
  if (typeof html !== "string" || !html.includes('data-vx-options-sales-page="1"')) return html;
  if (html.includes(PAGE_MARKER)) return html;
  let out = html.replace(/<div class="vx-options-sales" data-vx-options-sales-page="1">/, `<div class="vx-options-sales" data-vx-options-sales-page="1" ${PAGE_MARKER}>`);
  out = replaceAnchorTarget(out, locale === "ru" ? "Запросить доступ к опционам" : "Request Options Access");
  out = makeBenefitCardsClickable(out);
  out = applyMarketingCopy(out, locale);
  out = injectEvidenceIntoPreview(out, evidence, locale, error);
  return injectStyles(out);
}

function refineHomeOptionsEvidenceCopy(html, locale = "en") {
  if (typeof html !== "string") return html;
  const ru = locale === "ru";
  return html
    .replace("Position details and supporting records are protected.", ru ? "График и журнал Options открыты для просмотра." : "Options chart and trade journal are public.")
    .replace("Openings, updates and closures are published through the existing Options workflow. Public visitors see the product overview; entitled viewers can open the protected position history and brokerage records.", ru ? "Открытия, обновления и закрытия публикуются через существующий процесс Options. Посетители могут смотреть график результатов и Option Journal; файлы брокерских подтверждений остаются защищёнными и доступны одобренным пользователям." : "Openings, updates and closures are published through the existing Options workflow. Public visitors can review the Options performance chart and trade journal; brokerage proof files remain protected for approved viewers.");
}

function installOptionsPublicEvidenceRefinement(app, dependencies = {}) {
  const loadEvidence = dependencies.loadEvidence || loadCachedPublicOptionsEvidence;
  app.use((req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const pathname = requestPath(req);
    if ((method !== "GET" && method !== "HEAD") || (pathname !== OPTIONS_PATH && pathname !== HOME_PATH)) return next();
    const send = res.send.bind(res);
    res.send = function sendWithOptionsPublicEvidence(body) {
      const type = String(res.getHeader?.("Content-Type") || "").toLowerCase();
      const isHtml = typeof body === "string" && (!type || type.includes("html"));
      if (!isHtml || res.statusCode >= 300) return send(body);
      if (pathname === HOME_PATH) return send(refineHomeOptionsEvidenceCopy(body, requestLocale(req)));
      const locale = requestLocale(req);
      Promise.resolve()
        .then(() => loadEvidence())
        .then(evidence => send(refinePublicOptionsPage(body, evidence, locale, false)))
        .catch(error => {
          console.error("Options public evidence load error:", String(error?.message || error || "unknown"));
          send(refinePublicOptionsPage(body, { trades: [], curve: { points: [], total_realized_pnl: 0 } }, locale, true));
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
  if (typeof factory !== "function" || factory.__vixaleOptionsPublicEvidenceWrapped) return factory;
  function wrapped(...args) {
    const app = factory(...args);
    installOptionsPublicEvidenceRefinement(app);
    return app;
  }
  copyExpressStatics(wrapped, factory);
  Object.defineProperty(wrapped, "__vixaleOptionsPublicEvidenceWrapped", { value: true });
  return wrapped;
}

const originalLoad = Module._load;
Module._load = function vixaleOptionsPublicEvidenceModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  OPTIONS_PATH,
  HOME_PATH,
  ACCESS_HREF,
  OPTION_JOURNAL_RANGE,
  OPTION_PROOFS_RANGE,
  STYLE_ID,
  PAGE_MARKER,
  CACHE_TTL_MS,
  requestPath,
  requestLocale,
  optionTradeFromRow,
  parseOptionJournalRows,
  optionPnl,
  buildOptionsEquityCurve,
  buildPublicOptionsEvidence,
  loadPublicOptionsEvidenceFromSheets,
  loadCachedPublicOptionsEvidence,
  resetEvidenceCache,
  renderCompactChart,
  renderPublicJournal,
  journalToggleScript,
  replaceAnchorTarget,
  makeBenefitCardsClickable,
  applyMarketingCopy,
  injectEvidenceIntoPreview,
  refinePublicOptionsPage,
  refineHomeOptionsEvidenceCopy,
  installOptionsPublicEvidenceRefinement,
  wrapExpress,
};
