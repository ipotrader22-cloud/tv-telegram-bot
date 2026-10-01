# VIXALE Website — Current-State Manifest

Updated: 2026-10-01 America/New_York.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Swing live snapshot delivery fix — PR245

Website-facing PR #245, `Refresh full Swing snapshot on live page`, was merged to `main` as commit `bf73ca8bde61b967c963ea3c93247550968e643a`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render deploy: `dep-dav908bl550s73dlch30`.
Render deploy status: **live**.
Render deploy finished: `2026-10-01T16:54:37.847228Z`.

## Root cause addressed

The prior Swing client refresh behavior updated current quote cells and the Equity History SVG, but it did not replace the rest of the rendered Swing snapshot when portfolio membership or candidate/closed-trade composition changed. The quote refresher intentionally aborted when the already-rendered Active rows no longer matched the API Active rows. That could leave an already-open `/trading-systems/swing-trading` page visually stale after a valid Trading Lab morning update.

PR245 changes only the website presentation/delivery layer. The 60-second Swing refresh now fetches the fully enhanced canonical Swing page with browser cache bypass plus a cache-busting query token. It compares a locale-independent rendered snapshot signature based on the Last Updated footer and table ticker sequence. If the published snapshot changed, it atomically replaces the Swing `<main>` content and footer from the fresh server-rendered page. If the snapshot did not change, it retains the lightweight Equity History SVG refresh behavior.

This allows Active membership changes, Potential Candidates changes, Closed Trades changes, scores/notes tied to a new published snapshot, metrics, chart, and footer timestamp to move together on an already-open page rather than requiring a manual browser reload.

## Data state observed during incident

The authoritative Trading Lab `Public Feed` was independently re-read before the website change and already showed a valid `2026-10-01 10:00 ET` snapshot with 10 Active positions, including HPE, and VICR recorded in Closed Trades at +10% TARGET. Therefore the reported problem was delivery/presentation staleness, not a missing Trading Lab workbook update.

## Verification status

- GitHub `main` directly verified at merge commit `bf73ca8bde61b967c963ea3c93247550968e643a`.
- Render exact deploy `dep-dav908bl550s73dlch30` directly verified **live**.
- Render service remains auto-deploy-from-main and not suspended.
- Direct external browser verification of the post-deploy Swing DOM is **UNVERIFIED in this maintenance run** because the available external fetch surface returned cached/inaccessible content rather than a reliable live browser session. Do not upgrade this to browser-verified without a fresh live check.

## Safety boundary

PR245 does **not** change Trading Lab scoring, entries, exits, targets, scheduled stop logic, sizing, fixed-$10K accounting, Google Sheet writers, Public Feed schema, Equity History formulas, VECO logic, TWS/IBKR execution, or broker behavior.

Implementation files changed:

- `website_swing_equity_live_refresh.js`
- `tests/test_swing_equity_live_refresh.js`

Rollback: revert PR245 / merge commit `bf73ca8bde61b967c963ea3c93247550968e643a` and deploy. No workbook or trading-state rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-30-PR240.md` as the website Current-State manifest. The PR240 manifest remains the historical verified Options-page baseline; unrelated website areas retain their prior records.
