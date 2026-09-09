"use strict";

const Module = require("module");

const HOME_PATH = "/";
const DASHBOARD_PATH = "/dashboard";
const PERFORMANCE_PATH = "/public-performance.json";
const DASHBOARD_LIVE_PNL_PATH = "/dashboard/live-pnl.json";
const STYLE_ID = "vx-dashboard-home-metrics-style";
const SCRIPT_ID = "vx-dashboard-home-metrics-script";
const HOME_WIN_RATE_ID = "vx-home-proof-win-rate";
const DASHBOARD_OPEN_PNL_ID = "vx-dashboard-open-live-pnl";
const PREVIEW_COPY = "This preview mirrors the verified Day Trading block below. If the source is unavailable, values remain unavailable rather than being simulated.";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTagRangeFromOpen(html, tagName, openStart) {
  if (openStart < 0) return null;
  const pattern = new RegExp(`<\\/?${escapeRegex(tagName)}\\b[^>]*>`, "gi");
  pattern.lastIndex = openStart;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const isClose = new RegExp(`^<\\/${escapeRegex(tagName)}\\b`, "i").test(match[0]);
    depth += isClose ? -1 : 1;
    if (depth === 0) return { start: openStart, end: pattern.lastIndex };
  }
  return null;
}

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = pattern.exec(html);
  if (!match) return null;
  return findTagRangeFromOpen(html, tagName, match.index);
}

function removePreviewCopy(html) {
  const paragraph = new RegExp(`<p\\b[^>]*\\bclass=(["'])[^"']*\\bvx-home-proof-preview-copy\\b[^"']*\\1[^>]*>\\s*${escapeRegex(PREVIEW_COPY)}\\s*<\\/p>`, "i");
  return html.replace(paragraph, "");
}

function addHomePreviewMetrics(html) {
  if (html.includes(`id="${HOME_WIN_RATE_ID}"`)) return html;
  const range = findTagByClass(html, "div", "vx-home-proof-grid");
  if (!range) return html;
  const closeLength = "</div>".length;
  const cards = `<div><span>Live Open P&amp;L</span><strong data-vx-mirror="vx-home-live-open-pnl">—</strong></div><div><span>Win Rate</span><strong id="${HOME_WIN_RATE_ID}">—</strong></div>`;
  return html.slice(0, range.end - closeLength) + cards + html.slice(range.end - closeLength);
}

const styles = `
<style id="${STYLE_ID}">
  .vx-dashboard-title-inline{display:grid;grid-template-columns:minmax(360px,.92fr) minmax(520px,1.08fr);gap:18px;align-items:start;margin-bottom:4px}
  .vx-dashboard-title-inline>h1{margin-top:0!important;margin-bottom:0!important}
  .vx-dashboard-system-panels-inline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0}
  .vx-dashboard-system-panels-inline>*{min-width:0;margin-top:0!important;margin-bottom:0!important}
  @media(max-width:1180px){.vx-dashboard-title-inline{grid-template-columns:1fr}.vx-dashboard-system-panels-inline{max-width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:700px){.vx-dashboard-system-panels-inline{grid-template-columns:1fr}.vx-dashboard-title-inline{gap:12px}}
</style>`;

const script = `
<script id="${SCRIPT_ID}">
(() => {
  const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim();
  const leafWithText = text => Array.from(document.querySelectorAll('body *')).find(node => normalize(node.textContent) === text && !Array.from(node.children).some(child => normalize(child.textContent) === text));

  const formatMoney = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const applyPnlClass = (node, value) => {
    if (!node) return;
    const n = Number(value);
    node.classList.remove('positive', 'negative');
    if (Number.isFinite(n) && n > 0) node.classList.add('positive');
    else if (Number.isFinite(n) && n < 0) node.classList.add('negative');
  };

  const refreshHomeWinRate = async () => {
    const target = document.getElementById('${HOME_WIN_RATE_ID}');
    if (!target || document.hidden) return;
    try {
      const response = await fetch('${PERFORMANCE_PATH}', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const value = Number(payload && payload.summary && payload.summary.win_rate);
      if (Number.isFinite(value)) target.textContent = value.toFixed(2) + '%';
    } catch (_) {}
  };

  const findSystemPanel = (title, otherTitle) => {
    const titleNode = leafWithText(title);
    if (!titleNode) return null;
    let panel = titleNode.parentElement || titleNode;
    while (panel.parentElement && panel.parentElement !== document.body) {
      const parentText = normalize(panel.parentElement.textContent);
      if (parentText.includes(otherTitle) || parentText.length > 360) break;
      panel = panel.parentElement;
    }
    return panel;
  };

  const moveDashboardSystemPanels = () => {
    if (document.querySelector('.vx-dashboard-system-panels-inline')) return;
    const heading = Array.from(document.querySelectorAll('h1')).find(node => normalize(node.textContent) === 'Vixale Live Day Trading Dashboard');
    if (!heading || !heading.parentNode) return;
    const prime = findSystemPanel('Vixale Prime', 'Vixale Edge');
    const edge = findSystemPanel('Vixale Edge', 'Vixale Prime');
    if (!prime || !edge || prime === edge) return;
    const oldParents = new Set([prime.parentElement, edge.parentElement]);
    const row = document.createElement('div');
    row.className = 'vx-dashboard-title-inline';
    const systems = document.createElement('div');
    systems.className = 'vx-dashboard-system-panels-inline';
    heading.parentNode.insertBefore(row, heading);
    row.appendChild(heading);
    systems.appendChild(prime);
    systems.appendChild(edge);
    row.appendChild(systems);
    oldParents.forEach(parent => {
      if (!parent || parent === row || parent === systems || parent === document.body) return;
      if (!normalize(parent.textContent) && parent.children.length === 0) parent.remove();
    });
  };

  const addDashboardOpenPnlCard = () => {
    if (document.getElementById('${DASHBOARD_OPEN_PNL_ID}')) return document.getElementById('${DASHBOARD_OPEN_PNL_ID}');
    const label = leafWithText('Closed P&L Today');
    if (!label || !label.parentElement || !label.parentElement.parentNode) return null;
    const card = label.parentElement;
    const clone = card.cloneNode(true);
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const labelClone = Array.from(clone.querySelectorAll('*')).find(node => normalize(node.textContent) === 'Closed P&L Today' && !Array.from(node.children).some(child => normalize(child.textContent) === 'Closed P&L Today')) || clone.firstElementChild;
    if (labelClone) labelClone.textContent = 'Open Live P&L';
    const candidates = Array.from(clone.querySelectorAll('*')).filter(node => node !== labelClone && node.children.length === 0);
    const valueNode = candidates.find(node => /[\\d$—+-]/.test(normalize(node.textContent))) || clone.children[1] || clone;
    valueNode.id = '${DASHBOARD_OPEN_PNL_ID}';
    valueNode.textContent = '—';
    valueNode.classList.remove('positive', 'negative');
    card.parentNode.insertBefore(clone, card.nextSibling);
    return valueNode;
  };

  let dashboardTimer = null;
  let dashboardInFlight = false;
  const scheduleDashboardPnl = (delay = 2000) => {
    if (dashboardTimer) window.clearTimeout(dashboardTimer);
    dashboardTimer = null;
    if (document.hidden || !document.getElementById('${DASHBOARD_OPEN_PNL_ID}')) return;
    dashboardTimer = window.setTimeout(refreshDashboardPnl, delay);
  };
  async function refreshDashboardPnl() {
    const target = document.getElementById('${DASHBOARD_OPEN_PNL_ID}') || addDashboardOpenPnlCard();
    if (!target || dashboardInFlight || document.hidden) return;
    dashboardInFlight = true;
    try {
      const response = await fetch('${DASHBOARD_LIVE_PNL_PATH}', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 401) return;
      if (!response.ok) return;
      const payload = await response.json();
      const positions = Array.isArray(payload && payload.positions) ? payload.positions : null;
      if (!positions) return;
      let total = 0;
      for (const position of positions) {
        if (position == null || position.open_pnl === '' || position.open_pnl == null || !Number.isFinite(Number(position.open_pnl))) return;
        total += Number(position.open_pnl);
      }
      target.textContent = formatMoney(total);
      applyPnlClass(target, total);
    } catch (_) {
    } finally {
      dashboardInFlight = false;
      scheduleDashboardPnl(2000);
    }
  }

  const init = () => {
    if (document.getElementById('${HOME_WIN_RATE_ID}')) {
      refreshHomeWinRate();
      window.setInterval(refreshHomeWinRate, 60000);
    }
    const dashboardHeading = Array.from(document.querySelectorAll('h1')).some(node => normalize(node.textContent) === 'Vixale Live Day Trading Dashboard');
    if (dashboardHeading) {
      moveDashboardSystemPanels();
      addDashboardOpenPnlCard();
      scheduleDashboardPnl(100);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (dashboardTimer) window.clearTimeout(dashboardTimer);
      dashboardTimer = null;
      return;
    }
    refreshHomeWinRate();
    if (document.getElementById('${DASHBOARD_OPEN_PNL_ID}')) scheduleDashboardPnl(100);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
</script>`;

function injectAssets(html) {
  let result = html;
  if (!result.includes(`id="${STYLE_ID}"`)) {
    result = result.includes("</head>") ? result.replace("</head>", `${styles}\n</head>`) : `${styles}${result}`;
  }
  if (!result.includes(`id="${SCRIPT_ID}"`)) {
    result = result.includes("</body>") ? result.replace("</body>", () => `${script}\n</body>`) : `${result}${script}`;
  }
  return result;
}

function refineDashboardHomeMetrics(html, path) {
  if (typeof html !== "string") return html;
  if (path === HOME_PATH) {
    let result = removePreviewCopy(html);
    result = addHomePreviewMetrics(result);
    if (result.includes(`id="${HOME_WIN_RATE_ID}"`)) result = injectAssets(result);
    return result;
  }
  if (path === DASHBOARD_PATH) return injectAssets(html);
  return html;
}

function installDashboardHomeMetricsRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || (path !== HOME_PATH && path !== DASHBOARD_PATH)) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithDashboardHomeMetrics(body) {
      const type = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!type || type.includes("html"))) body = refineDashboardHomeMetrics(body, path);
      return originalSend(body);
    };
    next();
  });
}

function copyExpressStatics(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (["length", "name", "prototype", "arguments", "caller"].includes(String(key))) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    try { Object.defineProperty(target, key, descriptor); } catch (_) {}
  }
  Object.setPrototypeOf(target, Object.getPrototypeOf(source));
}

function wrapExpress(expressFactory) {
  if (typeof expressFactory !== "function" || expressFactory.__vixaleDashboardHomeMetricsWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installDashboardHomeMetricsRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleDashboardHomeMetricsWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleDashboardHomeMetricsModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  DASHBOARD_PATH,
  PERFORMANCE_PATH,
  DASHBOARD_LIVE_PNL_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  PREVIEW_COPY,
  findTagRangeFromOpen,
  findTagByClass,
  removePreviewCopy,
  addHomePreviewMetrics,
  injectAssets,
  refineDashboardHomeMetrics,
  installDashboardHomeMetricsRefinement,
  wrapExpress,
};
