'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appPath = path.join(root, 'app.js');
const handbookPath = path.join(root, 'docs', 'VECO_DEVELOPER_HANDBOOK.md');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch marker not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch marker is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let app = fs.readFileSync(appPath, 'utf8');

if (!app.includes("require('./lib/swing-leaders')")) {
  const before = `const {\n  createBrokerEodCallbackRegistry,\n  runBrokerEodCallback,\n} = require('./lib/broker-eod-callbacks');`;
  const after = `${before}\nconst {\n  createSwingLeadersHandlers,\n} = require('./lib/swing-leaders');`;
  app = replaceOnce(app, before, after, 'Swing Leaders module require');
}

if (!app.includes('href="/swing-leaders"')) {
  const before = `          <p class="small-note">The first strategy profile can be added here once its public specification is finalized.</p>`;
  const after = `          <a class="horizon-link" href="/swing-leaders">View Vixale Swing Leaders →</a>`;
  app = replaceOnce(app, before, after, 'Trading Systems Swing Leaders link');
}

if (!app.includes("app.get('/swing-leaders', swingLeadersHandlers.page)")) {
  const before = `app.get('/trading-systems', (req, res) => {\n  res.status(200).send(renderTradingSystemsHtml());\n});\n\napp.get('/risk-management', (req, res) => {`;
  const after = `app.get('/trading-systems', (req, res) => {\n  res.status(200).send(renderTradingSystemsHtml());\n});\n\nconst swingLeadersHandlers = createSwingLeadersHandlers({ getSheetsClient });\napp.get('/swing-leaders', swingLeadersHandlers.page);\napp.get('/api/swing-leaders', swingLeadersHandlers.api);\n\napp.get('/risk-management', (req, res) => {`;
  app = replaceOnce(app, before, after, 'Swing Leaders public routes');
}

fs.writeFileSync(appPath, app);

let handbook = fs.readFileSync(handbookPath, 'utf8');
const heading = '## Public Swing Leaders display feed (2026-08-27)';
if (!handbook.includes(heading)) {
  handbook = handbook.replace(/\s*$/, '') + `\n\n${heading}\n\n` +
`- Frozen contract: **Research/Data Display Freeze: Vixale Swing Leaders v1.0**. Trading Lab remains the authority for Morning Leader scoring, Ready Now / Close to Breakout / Early Watch classification, portfolio membership, entry/exit values, market posture, research notes, and cash state.\n` +
`- The public page is \`/swing-leaders\`; the sanitized read-only JSON endpoint is \`/api/swing-leaders\`. Neither route creates trading signals, broker orders, portfolio decisions, or research classifications.\n` +
`- The backend reads only the approved workbook's \`Public Feed\` tab through the existing server-side Google Sheets authentication. Google credentials and private workbook access are never returned to browser JavaScript.\n` +
`- \`lib/swing-leaders.js\` enforces a strict public whitelist for snapshot, active, watch, and closed-trade fields. Extra/private workbook columns are ignored and never serialized. Prices, returns, scores, classifications, market posture, and membership are not recalculated or inferred by the website.\n` +
`- The approved quote source for v1.0 is the \`GOOGLEFINANCE\` value already resolved by Trading Lab in Google Sheets. The page visibly labels the delayed-quote/model-portfolio disclosure and never presents those values as broker execution prices.\n` +
`- The server caches the last complete validated snapshot in memory for display resilience. A failed or invalid refresh keeps that snapshot and marks it stale; if no valid snapshot has yet been loaded, the page/API fail closed with HTTP 503 instead of constructing a partial portfolio.\n` +
`- The displayed Last Updated value always comes from \`snapshot_date\` + \`snapshot_time_et\` in the feed. Website fetch time is not substituted for the research snapshot time.\n` +
`- This integration is website/data-display only and must remain isolated from TradingView alerts, UAM, TWS/IBKR execution, VECO order/risk logic, and broker lifecycle behavior.\n`;
  fs.writeFileSync(handbookPath, handbook);
}

console.log('Swing Leaders integration patch applied.');
