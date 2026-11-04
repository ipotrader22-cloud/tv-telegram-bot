# VIXALE Website — Current-State Manifest (2026-11-04 / PR #363)

**Project:** VIXALE — Website / Design / Copy / Public Pages
**Target:** https://www.vixale.com/dashboard
**Repository:** `ipotrader22-cloud/tv-telegram-bot`
**Evidence date:** 2026-11-04 (America/New_York)

## Source and observed issue

The authenticated Dashboard browser tab on November 4 showed `LIVE TRACKING` between the main title and the subtitle, rather than immediately above `Last refreshed`. The badge still existed: this was a layout regression, not missing data or a status outage.

Source inspection confirmed that `app.js` creates `<div class="badge"><span class="dot"></span> LIVE TRACKING</div>` within `.topline`; `website_dashboard_snapshot_refinement.js` moved the heading to a separate top row without relocating that badge.

## Change and verification

- Website PR #363, `Restore Live Tracking badge above Dashboard refresh timestamp`, **MERGED**.
- Merged UI SHA: `13b4721ed0d9c48171cdf744ef7d8f63c93de392`.
- Changed files: `website_dashboard_snapshot_refinement.js`, `tests/test_dashboard_snapshot_refinement.js`.
- The existing badge is extracted once from the heading and rendered in a dedicated left-aligned row directly ahead of the unchanged timestamp. Its original badge/dot markup and refresh mechanism are preserved.
- Source/structural assertions verified the extraction, row placement, and regression test assertions. Full local Node test suite and CI: **NOT RUN**. No post-deploy authenticated visual check was performed.
- Render service `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`), deploy `dep-dbli9k5ckfvc73fjbj9g`, exact UI commit matched; status last observed `update_in_progress` during this documentation preparation. Final completion and authenticated rendered positioning remain **UNVERIFIED** until directly checked.

## Safety, rollback, and documentation

No trading strategies, signals, orders, broker/TWS/IBKR logic, APIs, secrets, data-source contracts, authentication, or trading calculations changed. Rollback: revert #363 via reviewed PR and verify Render. Developer handbook update not needed: the change is exclusively dashboard presentation; no architecture or configuration contract changed. Central documentation exporter/upload: **NOT PERFORMED** in this environment. Documentation commit uses `[skip render]` to avoid redeploying a documentation-only change.

Prior website baseline: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR361.md`.
