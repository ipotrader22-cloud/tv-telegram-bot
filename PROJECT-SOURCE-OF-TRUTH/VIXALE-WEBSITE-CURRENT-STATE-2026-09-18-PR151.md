# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #151 — `Align dedicated Day Trading chart with Results chart`
- **PR #151 merge SHA:** `7262de4c92cf3d72138b772e34ebd0605a2f2eaf`
- **Observed PR #151 state:** MERGED
- **Focused pre-merge verification:** GitHub Actions run `35408034488` — SUCCESS for syntax, dedicated Day chart regression, emitted inline-script regression, existing Results chart regression, public performance regression, Issue #123 final-QA regression, and `git diff --check` on the tested head. The final PR head differed only by deletion of the temporary verification workflow.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #151:** `dep-damt4gff3r2c73dhfbbg`
- **Render deployed website-changing SHA:** `7262de4c92cf3d72138b772e34ebd0605a2f2eaf`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #151 merge SHA was checked out on `main`; `npm install` completed; build reported `Build successful`; `npm start` loaded `website_conversion_system_pages_refinement.js`; the server reported `Server running on port 10000`; Render reported `Your service is live` at `2026-09-19T00:08:09Z`.
- **Fresh independent public-origin visual verification after PR #151:** UNVERIFIED. The available web retrieval returned a cached/stale representation and did not generate a corresponding fresh request in Render request logs, so it is not treated as live-origin proof of the final rendered page.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #151 as the latest website-changing code reference.

## PR #151 — dedicated Day Trading chart presentation

PR #151 changes only the dedicated `/trading-systems/day-trading` chart presentation:

- source remains `/public-performance.json`;
- chart values remain the existing `equity_curve.points[].cumulative_pnl` values;
- Open P&L remains separate on `/public-live-open-pnl.json`;
- the chart adds visible Y-axis money labels, horizontal reference guides, a visible zero baseline when in range, first/last date labels, point markers for compact histories, and a `Realized P&L` legend;
- the chart keeps existing unavailable/stale behavior and the callback-based inline-script injection safety pattern;
- no history points are created, interpolated, backfilled, or recalculated.

## Data and safety boundary

PR #151 does **not** change Day realized-P&L arithmetic, Google Sheets reads/writes or schema, Trading Lab logic, Swing data, Options data, quote sources, authentication, Telegram, Pine, signal timing, entries/exits/targets/stops, bridge, TWS, IBKR, or risk behavior. It is a website presentation-only change.

## Prior website-changing state

The immediately preceding website presentation state is recorded in:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18-PR149.md`

Its contracts remain in force except where PR #151 explicitly supersedes the dedicated Day Trading chart presentation.
