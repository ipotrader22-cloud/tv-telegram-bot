# VIXALE Website — Current-State Manifest (2026-11-04 / PR #366)

**Scope:** Website / Design / Copy / Public Pages  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Target:** `https://www.vixale.com/dashboard`  
**Evidence date:** 2026-11-04 (America/New_York)

## Website source change

- PR #365 merged at `0f4883bda8014a4b48dd8dc031dd96b332a655e7`: compact dashboard title, Prime/Edge cards, tracking metadata and seven KPI tiles. Render deploy `dep-dblicjc9v7es73d69qu0` was directly listed as **live** (finished `2026-11-04T12:35:05Z`); authenticated browser visual verification **UNVERIFIED**.
- PR #366 merged at `81e536cafbd4cd739ca8e8f2d5248441a4e8a075`: centered white-to-light-purple **Trade History by every day** card beneath Prime/Edge links to `/daily-trading-summary`. Existing **Full Trade History** anchor is rewritten to the same path. Tablet/mobile styles and keyboard focus styling included.
- Changed implementation: `website_dashboard_snapshot_refinement.js`; regression assertions: `tests/test_dashboard_snapshot_refinement.js`.
- Render deploy `dep-dblii3k9v7es73d6hgl0`, exact commit `81e536cafbd4cd739ca8e8f2d5248441a4e8a075`, was observed **build_in_progress** on direct Render listing. Final deployment and authenticated browser appearance **UNVERIFIED**.
- Test code added for link rewriting/idempotency, card placement, gradient, and responsive layout. Node suite / GitHub CI / actual browser test **NOT RUN** during this change.

## Boundary

Only presentation, styles and link destinations changed. No broker execution, trading engine, signal logic, authentication, live data calculations, API contracts or secrets changed. No handbook architecture changes required. The documentation update is separate, marked `[skip render]` to prevent a documentation-only deploy. Central documentation exporter/upload **NOT PERFORMED**.

## Rollback

Revert PR #366 using a reviewed revert PR; verify subsequent Render deploy and authenticated dashboard behavior. The prior operational manifest is `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR363.md`.
