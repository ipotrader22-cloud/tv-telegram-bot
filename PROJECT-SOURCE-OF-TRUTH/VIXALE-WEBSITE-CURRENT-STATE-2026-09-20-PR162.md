# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-20 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #162 — `Mirror homepage Day preview from the public performance feed`
- **PR #162 merge SHA:** `2cf92c9896494273f724508e4b27cd3a5d9e2ffe`
- **Observed PR #162 state:** MERGED
- **Pre-merge verification:** GitHub Actions run `35491303445` — SUCCESS for syntax, direct-feed integration/middleware ordering, Issue #123 homepage/final-QA regressions, homepage preview readability, homepage performance/runtime-script regressions, chart inline-script injection, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #162:** `dep-danmqu97lnhs73eb2ba0`
- **Render deployed website-changing SHA:** `2cf92c9896494273f724508e4b27cd3a5d9e2ffe`
- **Render deployment status:** LIVE
- **Render verification:** exact merge SHA was checked out; `npm install` completed; build succeeded; `npm start` loaded `website_home_day_preview_feed_refinement.js` before `website_conversion_home_refinement.js`; the server reported `Server running on port 10000`; deploy status reached `live` at `2026-09-20T05:22:47.933511Z`.
- **Fresh independent browser verification:** UNVERIFIED in the current tool environment. Deployment and runtime startup are verified, but pixel-level homepage behavior should still be confirmed in a browser.

## PR #162 — Homepage Day preview direct-feed ownership

The top homepage Day Trading tab no longer depends on cloning the lower homepage Equity Curve SVG DOM.

The production relationship is now:

```text
/public-performance.json
→ equity_curve.points[]
→ lower Day Trading performance chart
→ top Day Trading preview chart independently renders the same feed
```

`website_home_day_preview_feed_refinement.js` owns the top preview chart. It reads the existing `/public-performance.json` endpoint and plots only the existing `equity_curve.points[].cumulative_pnl` values. It does not recalculate realized P&L, synthesize points, interpolate history, or substitute mock data.

The visible top chart target is retargeted from the legacy `vx-conversion-day-chart` ID to `vx-conversion-day-feed-chart`, so older DOM-clone/final-QA writers that still look for the legacy target no longer overwrite the visible preview. Lower-chart responsive redraws therefore do not control the top chart geometry.

The lower Day Trading performance card, its source, and its refresh behavior are unchanged.

## Data and safety boundary

PR #162 does **not** change:

- `/public-performance.json` calculations or schema;
- `equity_curve.points[].cumulative_pnl` values;
- Closed Trades calculations;
- Google Sheets reads or writes;
- Trading Lab output;
- Telegram;
- Pine / strategy behavior;
- signal timing;
- entries, exits, targets, stops, sizing, or risk;
- authentication;
- bridge, TWS, or IBKR execution behavior.

This is a public website presentation/runtime ownership change only.

## Prior website-changing state

The prior Current-State manifest is:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-20-PR160.md`

Its contracts remain in force except where PR #162 explicitly supersedes homepage Day preview chart ownership.
