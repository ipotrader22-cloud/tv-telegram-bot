# VIXALE Website — Current-State Manifest

**Project:** VIXALE Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-29 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verified deployment

- Website-facing PR: #224 — `Refresh Swing equity chart from latest Equity History` — MERGED.
- Merge/deployed commit: `d59ad051ca16361ef98c03a70b57c17e6f265d48`.
- Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
- Render deploy: `dep-dau126jrjlhs73cac3h0`.
- Render deploy status: `live`.
- Render deploy finished: 2026-09-29T19:28:30.414759Z.
- Production EN/RU Browser QA run: `36619364229` (run #98) was still in progress when this manifest was prepared; final workflow conclusion remains **UNVERIFIED** until re-read.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-28-PR221.md` for the Swing equity-chart refresh deployment. PR221 remains the historical baseline for TP/SL display behavior.

## Swing Equity History refresh

The Trading Lab Google Sheet `Equity History` remains the authoritative historical dataset. The existing Swing service reads that worksheet and server-renders the Model P&L SVG chart.

PR #224 fixes a presentation gap on `/trading-systems/swing-trading`: the existing 60-second client refresh already updated Current, Return, row P&L, aggregate unrealized P&L, and current Total Model P&L, but it did not replace the historical SVG chart after a new `Equity History` snapshot was written.

The new presentation-only refresher:

- runs only on `/trading-systems/swing-trading`;
- polls every 60 seconds only while the tab is visible;
- fetches the existing server-rendered `/swing-leaders` source with `cache: no-store`;
- extracts `.equity-chart-card .equity-chart-svg`;
- replaces only the current SVG when the authoritative rendered chart differs.

No independent equity calculation is introduced in the browser. The server-rendered chart remains derived from the existing `Equity History` service logic.

## Data state relevant to the reported issue

Before the website fix, the Trading Lab workbook had already been verified with a 2026-09-29 Equity History row at 14:40 ET showing total Model P&L `$3,759.88` and model equity `$103,759.88`. The reported stale chart was therefore a frontend refresh issue rather than a missing Equity History write.

## Safety boundary

PR #224 does **not** change:

- Trading Lab scoring or portfolio membership logic;
- entries, exits, stops, targets, sizing, rotation, or fixed-$10K accounting;
- Public Feed or Equity History schemas;
- Google Sheet authoritative data;
- VECO trading logic, TWS/IBKR execution, or broker behavior.

It is presentation/refresh behavior only.

## Implementation files

PR #224 changed:

```text
website_swing_equity_live_refresh.js
package.json
tests/test_swing_equity_live_refresh.js
```

## Rollback

Revert PR #224 / merge commit `d59ad051ca16361ef98c03a70b57c17e6f265d48` and deploy. No data migration, workbook rollback, or broker action is required.
