"use strict";

function finiteMetric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function drawResults(document, fetch) {
  const ru = document.documentElement.lang === "ru";
  const locale = ru ? "ru-RU" : "en-US";
  const dollars = Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });
  const compact = Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 });
  const dateFormat = Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const text = (en, translated) => ru ? translated : en;
  const byId = id => document.getElementById(id);
  const setText = (id, value) => {
    const element = byId(id);
    if (element) element.textContent = value;
  };
  const money = value => value === null ? "—" : (value > 0 ? "+" : "") + dollars.format(value);
  const setMoney = (id, value) => {
    const number = finiteMetric(value);
    const el = byId(id);
    el.textContent = money(number);
    el.classList.toggle("positive", number !== null && number > 0);
    el.classList.toggle("negative", number !== null && number < 0);
  };
  const node = (name, attrs, value) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));
    if (value != null) el.textContent = value;
    return el;
  };
  const get = async url => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Results HTTP " + response.status);
    const payload = await response.json();
    if (!payload.ok) throw new Error("Results unavailable");
    return payload;
  };

  function chart(system, points, label) {
    const svg = byId("vx-results-" + system + "-chart");
    const status = byId("vx-results-" + system + "-empty");
    const data = (Array.isArray(points) ? points : []).map(point => ({
      value: finiteMetric(point?.cumulative_pnl),
      date: Date.parse(point?.date),
    }));
    const valid = data.filter(point => point.value !== null);
    if (!valid.length) {
      status.textContent = text("No realized history is available.", "История реализованных результатов пока недоступна.");
      return;
    }
    status.remove();
    const dated = data.map((point, index) => ({ ...point, index }))
      .filter(point => Number.isFinite(point.date));
    const first = dated[0];
    const last = dated.at(-1);
    const end = valid.at(-1).value;
    const range = first && last
      ? new Date(first.date).toISOString().slice(0, 10) + " → " + new Date(last.date).toISOString().slice(0, 10) + " · "
      : "";
    const summary = label + " · " + range + money(end);
    svg.setAttribute("aria-label", summary);
    const summaryId = "vx-results-" + system + "-chart-summary";
    const summaryNode = document.createElement("p");
    summaryNode.className = "vx-result-chart-summary";
    summaryNode.id = summaryId;
    summaryNode.textContent = summary;
    svg.parentElement.insertAdjacentElement("afterend", summaryNode);

    const render = () => {
      const width = Math.max(1, Math.floor(svg.clientWidth));
      const height = Math.max(160, svg.clientHeight);
      if (width < 120) return;
      const left = 68, right = width - 12, top = 14, bottom = height - 34;
      const values = valid.map(point => point.value);
      const low = Math.min(0, ...values), high = Math.max(0, ...values);
      const padding = Math.max(1, (high - low) * .1);
      const minimum = low - padding, maximum = high + padding;
      const x = i => data.length === 1 ? (left + right) / 2 : left + i * (right - left) / (data.length - 1);
      const y = value => top + (maximum - value) * (bottom - top) / (maximum - minimum);
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      svg.replaceChildren(node("title", {}, summary));
      for (let i = 0; i < 5; i++) {
        const value = maximum - (maximum - minimum) * i / 4;
        const yy = y(value);
        svg.append(node("line", { x1:left, x2:right, y1:yy, y2:yy, stroke:"#6c9380", opacity:".45" }),
          node("text", { x:left-7, y:yy+4, "text-anchor":"end", fill:"#d5e8df", "font-size":11 }, compact.format(value)));
      }
      svg.append(node("line", { x1:left, x2:right, y1:y(0), y2:y(0), stroke:"#a9c1b5", "stroke-dasharray":"4 4" }));
      let segment = [];
      const finish = () => {
        if (segment.length > 1) svg.append(node("polyline", { points: segment.join(" "), fill:"none", stroke:"#79e6ab", "stroke-width":2.5, "stroke-linejoin":"round" }));
        if (segment.length === 1) {
          const [cx, cy] = segment[0].split(",");
          svg.append(node("circle", { cx, cy, r:3, fill:"#79e6ab" }));
        }
        segment = [];
      };
      data.forEach((point, i) => {
        if (point.value === null) finish();
        else segment.push(x(i) + "," + y(point.value));
      });
      finish();
      if (!dated.length) return;
      const available = Math.min(8, Math.max(2, Math.floor((right-left) / 82)));
      const count = Math.min(available, dated.length);
      let previous = -Infinity;
      for (let i = 0; i < count; i++) {
        const point = dated[count === 1 ? 0 : Math.round(i * (dated.length-1) / (count-1))];
        const edge = i === 0 || i === count-1;
        const xx = i === 0 ? left : i === count-1 ? right : x(point.index);
        if (!edge && (xx - previous < 70 || right - xx < 70)) continue;
        const date = node("text", { x:xx, y:height-12, "text-anchor":i===0?"start":i===count-1?"end":"middle",
          fill:"#d5e8df", "font-size":11, "data-date-tick":"weekly" }, dateFormat.format(point.date));
        svg.append(date);
        previous = xx;
      }
    };
    render();
    new ResizeObserver(render).observe(svg.parentElement);
  }

  get("/public-performance.json").then(data => {
    const summary = data.summary || {}, equity = data.equity_curve || {};
    setText("vx-results-day-open", finiteMetric(summary.open_count) ?? "—");
    setMoney("vx-results-day-closed", summary.closed_pnl_today);
    setMoney("vx-results-day-total", equity.total_realized_pnl);
    chart("day", equity.points, text("Day Trading realized P&L", "Реализованный P&L дейтрейдинга"));
    setText("vx-results-day-state", data.stale
      ? text("Last validated Day Trading snapshot", "Последний подтверждённый снимок дейтрейдинга")
      : text("Closed Trades ledger · Open P&L shown separately", "Журнал закрытых сделок · Открытый P&L указан отдельно"));
  }).catch(() => setText("vx-results-day-empty", text("Day Trading history is temporarily unavailable.", "История дейтрейдинга временно недоступна.")));

  get("/public-live-open-pnl.json").then(data => setMoney("vx-results-day-open-pnl", data.open_pnl)).catch(() => {});

  get("/public-options-performance.json").then(data => {
    const equity = data.equity_curve || {};
    setMoney("vx-results-options-total", equity.total_realized_pnl);
    chart("options", equity.points, text("Options realized P&L", "Реализованный P&L по опционам"));
  }).catch(() => setText("vx-results-options-empty", text("Options history is temporarily unavailable.", "История опционов временно недоступна.")));
}

if (typeof module !== "undefined") module.exports = { finiteMetric };
else if (document.querySelector("[data-vx-conversion-results]")) drawResults(document, window.fetch.bind(window));
