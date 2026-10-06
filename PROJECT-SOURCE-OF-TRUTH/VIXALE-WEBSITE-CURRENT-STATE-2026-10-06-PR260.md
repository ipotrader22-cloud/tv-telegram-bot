# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: \`ipotrader22-cloud/tv-telegram-bot\`, production branch \`main\`.

## Daily Trading Summary blog — PR260

Website-facing PR #260, \`Add shareable daily trading summary blog\`, was squash-merged to \`main\` as implementation commit:

\`\`\`text
88209a628b4d92e25c32a7955cdaaf0d2b8de158
\`\`\`

Render production service: \`tv-telegram-bot\` (\`srv-d86vh7j7uimc73ao479g\`).
Render workspace: \`Trader's workspace\` (\`tea-d86vflpkh4rs73f3t7n0\`).
Verified implementation deploy: \`dep-db2cfqs9v7es738c228g\`.
Verified implementation deploy commit: \`88209a628b4d92e25c32a7955cdaaf0d2b8de158\`.
Verified deploy status: **live**.
Deploy finished: \`2026-10-06T10:06:22.203175Z\`.

PR browser QA:
- workflow: **Production EN/RU Browser QA**
- run: **#142**
- result: **SUCCESS**

Render startup verification:
- exact implementation commit checked out;
- \`npm install\` build completed successfully;
- \`website_daily_trading_summary.js\` is present in the production \`npm start\` preload chain;
- server reached \`Server running on port 10000\`;
- Render reported the service **live**.

Direct external crawler/browser retrieval of the new recap URL was **UNVERIFIED** in this maintenance run because the available web-fetch tool could not access the newly created, non-indexed route. This is a verification limitation, not evidence of an HTTP failure. Do not replace this statement with a success claim until a direct public-route fetch is observed.

## Production source behavior

The website source now defines:

\`\`\`text
/daily-trading-summary
/daily-trading-summary/YYYY-MM-DD
\`\`\`

The index lists up to 45 activity dates. A dated page is a shareable public permalink with canonical/Open Graph/Twitter metadata plus Copy Link, X, and LinkedIn share actions.

The source is server-side and read-only. It reuses the existing Render Google Sheets configuration and reads:

\`\`\`text
Trades!A:J
Closed Trades!A:J
Trade Metadata!A:H
Option Journal!A:S
\`\`\`

A one-minute process cache bounds repeated Sheet reads.

## Public/private data boundary

The recap intentionally does **not** duplicate the private dashboard.

- \`Trades\` supplies only the aggregate count of broker-confirmed FILL / ENTRY_FILL rows for the selected date.
- \`Closed Trades\` supplies public closed-trade details and the recorded numeric realized P&L for rows whose close date equals the recap date.
- \`Trade Metadata\` may supply the already-recorded public system label for a closed trade; raw metadata and broker/execution identities are never rendered.
- An entry that remained open does not expose its symbol, side, quantity, entry, target, or stop on the public recap.
- Historical \`Open Positions\` and \`Pending\` state is not reconstructed after the fact.
- Option Journal output is restricted to records marked **Closed** whose **Exit Date** equals the recap date. Open option positions, Notes, internal IDs, and brokerage-proof paths are not published.

The private owner email may still include live Open/Pending context captured at its scheduled 16:05 ET run.

## Verification completed before merge

- module syntax: PASS;
- regression test syntax: PASS;
- functional same-day/carried-close summary regression: PASS;
- public open-position privacy regression: PASS;
- public open-options privacy regression: PASS;
- missing numeric values render unavailable instead of fabricated \`$0.00\`: PASS;
- package preload regression: PASS;
- PR branch was ahead of \`main\` with no behind commits before merge;
- Production EN/RU Browser QA run #142: PASS.

Render's build-time \`npm install\` reported dependency audit findings (7 moderate, 1 critical). PR260 changed no dependencies or lockfile and did not attempt an unrelated dependency upgrade.

## Files changed by PR260

\`\`\`text
website_daily_trading_summary.js
tests/test_daily_trading_summary.js
package.json
docs/VECO_DEVELOPER_HANDBOOK.md
\`\`\`

\`app.js\` is unchanged.

## Safety boundary

PR260 does **not** change:

- Pine or TradingView strategy behavior;
- entry, exit, stop, target, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram trade lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer-code behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: YES — completed in PR260.**

ADR-023 documents the public recap route, source ownership, and privacy boundary.

## Rollback

Revert PR260 / implementation commit:

\`\`\`text
88209a628b4d92e25c32a7955cdaaf0d2b8de158
\`\`\`

then allow the normal Render deployment of the prior confirmed code. No broker, Pine, trade-ledger, Option Journal, or customer-data rollback is required.

This manifest supersedes \`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR258.md\`. The PR258 manifest remains historical.
