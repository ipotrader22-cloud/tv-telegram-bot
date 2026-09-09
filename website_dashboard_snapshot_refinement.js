"use strict";

const Module = require("module");

const HOME_PATH = "/";
const DASHBOARD_PATH = "/dashboard";
const STYLE_ID = "vx-dashboard-snapshot-refinement-style";
const SCRIPT_ID = "vx-dashboard-snapshot-refinement-script";
const HOME_WIN_RATE_ID = "vx-home-proof-win-rate";
const DASHBOARD_OPEN_PNL_ID = "vx-dashboard-open-live-pnl";

const HOME_PREVIEW_COPY = "This preview mirrors the verified Day Trading block below. If the source is unavailable, values remain unavailable rather than being simulated.";

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
    if (depth === 0) return { start: openStart, end: pattern.lastIndex, closeStart: match.index };
  }
  return null;
}

function findTagByClass(html, tagName, className) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\bclass=(["'])[^"']*\\b${escapeRegex(className)}\\b[^"']*\\1[^>]*>`, "i");
  const match = pattern.exec(html);
  if (!match) return null;
  return findTagRangeFromOpen(html, tagName, match.index);
}

function injectStyles(html) {
  if (html.includes(`id="${STYLE_ID}"`)) return html;
  const styles = `
<style id="${STYLE_ID}">
  .vx-dashboard-top-layout{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(520px,1.35fr);gap:14px;align-items:start;margin-bottom:14px}
  .vx-dashboard-heading-block{min-width:0;margin:0!important}
  .vx-dashboard-system-cards-row{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important;margin:0!important;align-items:stretch!important;min-width:0}
  .vx-dashboard-system-cards-row>*{min-width:0!important;width:auto!important;max-width:none!important;margin:0!important}
  .vx-dashboard-metric-row{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:12px!important;align-items:stretch!important}
  .vx-dashboard-metric-row>*{min-width:0!important;width:auto!important;max-width:none!important}
  #${DASHBOARD_OPEN_PNL_ID}.positive{color:#00954f!important}
  #${DASHBOARD_OPEN_PNL_ID}.negative{color:#ef3f4a!important}
  @media(max-width:1180px){.vx-dashboard-top-layout{grid-template-columns:1fr}.vx-dashboard-metric-row{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
  @media(max-width:760px){.vx-dashboard-system-cards-row{grid-template-columns:1fr!important}.vx-dashboard-metric-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${styles}\n</head>`) : `${styles}${html}`;
}

const browserScript = `
<script id="${SCRIPT_ID}">
(() => {
  const compact = value => String(value || '').replace(/\\s+/g, ' ').trim();
  const all = selector => Array.from(document.querySelectorAll(selector));
  const leafByExactText = text => all('body *').find(el => el.children.length === 0 && compact(el.textContent) === text) || null;
  const leafByPrefix = prefix => all('body *').find(el => el.children.length === 0 && compact(el.textContent).startsWith(prefix)) || null;

  const commonAncestor = (a, b) => {
    if (!a || !b) return null;
    const seen = new Set();
    for (let node = a; node; node = node.parentElement) seen.add(node);
    for (let node = b; node; node = node.parentElement) if (seen.has(node)) return node;
    return null;
  };

  const locateMetricCard = labelText => {
    const label = leafByExactText(labelText);
    if (!label) return null;
    const peerLabels = ['Open Positions', 'Working Orders', 'Closed Trades Today', 'Closed P&L Today', 'Total Closed P&L', 'Win Rate'];
    let node = label;
    while (node && node.parentElement && node.parentElement !== document.body) {
      const parent = node.parentElement;
      const text = compact(parent.textContent);
      const peerCount = peerLabels.filter(peer => text.includes(peer)).length;
      if (peerCount >= 4 && parent.children.length >= 4) return { label, card: node, row: parent };
      node = parent;
    }
    return null;
  };

  const formatMoney = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '-' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const setSignedClass = (el, value) => {
    if (!el) return;
    const n = Number(value);
    el.classList.remove('positive', 'negative');
    if (Number.isFinite(n) && n > 0) el.classList.add('positive');
    else if (Number.isFinite(n) && n < 0) el.classList.add('negative');
  };

  const installDashboardTopLayout = () => {
    const title = leafByExactText('Vixale Live Day Trading Dashboard');
    const refreshed = leafByPrefix('Last refreshed:');
    const prime = leafByExactText('Vixale Prime');
    const edge = leafByExactText('Vixale Edge');
    if (!title || !prime || !edge) return;

    const systemsRow = commonAncestor(prime, edge);
    let headingBlock = refreshed ? commonAncestor(title, refreshed) : title.parentElement;
    if (!systemsRow || !headingBlock || systemsRow === headingBlock || headingBlock.contains(systemsRow)) return;

    while (headingBlock.parentElement && headingBlock.parentElement !== document.body && headingBlock.parentElement.contains(systemsRow)) {
      break;
    }

    if (document.querySelector('.vx-dashboard-top-layout')) return;
    const parent = headingBlock.parentElement;
    if (!parent || !parent.contains(systemsRow)) return;

    const layout = document.createElement('div');
    layout.className = 'vx-dashboard-top-layout';
    parent.insertBefore(layout, headingBlock);
    headingBlock.classList.add('vx-dashboard-heading-block');
    systemsRow.classList.add('vx-dashboard-system-cards-row');
    layout.appendChild(headingBlock);
    layout.appendChild(systemsRow);
  };

  const installDashboardOpenPnlCard = () => {
    if (document.getElementById('${DASHBOARD_OPEN_PNL_ID}')) return;
    const located = locateMetricCard('Closed P&L Today');
    if (!located || !located.card || !located.row) return;

    const clone = located.card.cloneNode(true);
    const cloneLeaves = Array.from(clone.querySelectorAll('*')).filter(el => el.children.length === 0);
    const label = cloneLeaves.find(el => compact(el.textContent) === 'Closed P&L Today');
    if (!label) return;
    label.textContent = 'Open Live P&L';

    const value = cloneLeaves.filter(el => el !== label && compact(el.textContent)).pop();
    if (!value) return;
    value.id = '${DASHBOARD_OPEN_PNL_ID}';
    value.textContent = '—';
    value.classList.remove('positive', 'negative');

    located.row.classList.add('vx-dashboard-metric-row');
    located.card.insertAdjacentElement('afterend', clone);
  };

  let dashboardPnlTimer = null;
  let dashboardPnlBusy = false;
  const refreshDashboardOpenPnl = async () => {
    const target = document.getElementById('${DASHBOARD_OPEN_PNL_ID}');
    if (!target || dashboardPnlBusy || document.hidden) return;
    dashboardPnlBusy = true;
    try {
      const response = await fetch('/dashboard/live-pnl.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const positions = Array.isArray(payload && payload.positions) ? payload.positions : null;
      if (!positions) return;
      let total = 0;
      for (const position of positions) {
        const value = Number(position && position.open_pnl);
        if (!Number.isFinite(value)) return;
        total += value;
      }
      target.textContent = formatMoney(total);
      setSignedClass(target, total);
    } catch (_) {
    } finally {
      dashboardPnlBusy = false;
      if (dashboardPnlTimer) window.clearTimeout(dashboardPnlTimer);
      if (!document.hidden) dashboardPnlTimer = window.setTimeout(refreshDashboardOpenPnl, 2000);
    }
  };

  const refreshHomeWinRate = async () => {
    const target = document.getElementById('${HOME_WIN_RATE_ID}');
    if (!target || document.hidden) return;
    try {
      const response = await fetch('/public-performance.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const value = Number(payload && payload.summary && payload.summary.win_rate);
      if (!Number.isFinite(value)) return;
      target.textContent = value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '%';
    } catch (_) {}
  };

  const boot = () => {
    installDashboardTopLayout();
    installDashboardOpenPnlCard();
    refreshDashboardOpenPnl();
    refreshHomeWinRate();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (dashboardPnlTimer) window.clearTimeout(dashboardPnlTimer);
      dashboardPnlTimer = null;
      return;
    }
    refreshDashboardOpenPnl();
    refreshHomeWinRate();
  });
})();
</script>`;

function injectScript(html) {
  if (html.includes(`id="${SCRIPT_ID}"`)) return html;
  return html.includes("</body>") ? html.replace("</body>", `${browserScript}\n</body>`) : `${html}${browserScript}`;
}

function refineHome(html) {
  let result = String(html);
  result = result.replace(new RegExp(`<p\\b[^>]*\\bclass=(["'])[^"']*\\bvx-home-proof-preview-copy\\b[^"']*\\1[^>]*>\\s*${escapeRegex(HOME_PREVIEW_COPY)}\\s*<\\/p>`, "i"), "");
  if (!result.includes(`id="${HOME_WIN_RATE_ID}"`)) {
    const range = findTagByClass(result, "div", "vx-home-proof-grid");
    if (range) {
      const extra = `\n      <div><span>Live Open P&amp;L</span><strong data-vx-mirror="vx-home-live-open-pnl">—</strong></div>\n      <div><span>Win Rate</span><strong id="${HOME_WIN_RATE_ID}">—</strong></div>`;
      result = result.slice(0, range.closeStart) + extra + result.slice(range.closeStart);
    }
  }
  result = injectStyles(result);
  return injectScript(result);
}

function refineDashboard(html) {
  let result = injectStyles(String(html));
  return injectScript(result);
}

function refinePage(html, path) {
  if (typeof html !== "string") return html;
  if (path === HOME_PATH) return refineHome(html);
  if (path === DASHBOARD_PATH) return refineDashboard(html);
  return html;
}

function installDashboardSnapshotRefinement(app) {
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const isRead = req.method === "GET" || req.method === "HEAD";
    if (!isRead || (path !== HOME_PATH && path !== DASHBOARD_PATH)) return next();
    const originalSend = res.send.bind(res);
    res.send = function sendWithDashboardSnapshotRefinement(body) {
      const contentType = String(res.getHeader("Content-Type") || "");
      if (typeof body === "string" && (!contentType || contentType.includes("html"))) body = refinePage(body, path);
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
  if (typeof expressFactory !== "function" || expressFactory.__vixaleDashboardSnapshotRefinementWrapped) return expressFactory;
  function wrappedExpress(...args) {
    const app = expressFactory(...args);
    installDashboardSnapshotRefinement(app);
    return app;
  }
  copyExpressStatics(wrappedExpress, expressFactory);
  Object.defineProperty(wrappedExpress, "__vixaleDashboardSnapshotRefinementWrapped", { value: true });
  return wrappedExpress;
}

const originalLoad = Module._load;
Module._load = function vixaleDashboardSnapshotRefinementModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  return request === "express" ? wrapExpress(loaded) : loaded;
};

module.exports = {
  HOME_PATH,
  DASHBOARD_PATH,
  STYLE_ID,
  SCRIPT_ID,
  HOME_WIN_RATE_ID,
  DASHBOARD_OPEN_PNL_ID,
  HOME_PREVIEW_COPY,
  findTagRangeFromOpen,
  findTagByClass,
  injectStyles,
  injectScript,
  refineHome,
  refineDashboard,
  refinePage,
  installDashboardSnapshotRefinement,
  wrapExpress,
};
