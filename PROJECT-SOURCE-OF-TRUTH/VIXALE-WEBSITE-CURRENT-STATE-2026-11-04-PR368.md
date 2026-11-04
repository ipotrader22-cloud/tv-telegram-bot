# VIXALE Website — Current-State Manifest (2026-11-04 / PR #368)

**Scope:** Website / Design / Copy / Public Pages  
**Target:** https://www.vixale.com/daily-trading-summary  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`

## Verified source and change

- PR #368 merged into `main`, commit `a196504c9ac205aa4ccca1aadbf671f55c21e314`.
- `website_daily_trading_summary.js` index page heading **Daily Trading Summaries** reduced by 30%, from `clamp(36px,5vw,60px)` to `clamp(25.2px,3.5vw,42px)` via a heading-specific CSS selector. Individual dated report headings are unchanged.
- Subtitle replaced with exact wording: **Click on any date to see all trades for that trading day**.
- Tests added in `tests/test_daily_trading_summary.js` for text, font-size CSS and retained clickable date links. Source checks passed; complete Node suite and authenticated browser QA **NOT RUN**.
- Render deploy `dep-dbliplfb9u1s73bhrmq0` for exact UI commit was observed `build_in_progress` on 2026-11-04. Final live status / visually rendered page **UNVERIFIED** until separately checked.

## Scope and rollback

No change to ledger source, day filters, trade computations, trading logic, execution, authentication, or route semantics. Revert PR #368 through reviewed PR if necessary. Documentation-only changes use `[skip render]`; central exporter/upload **NOT PERFORMED**. Prior website manifest: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR366.md`.
