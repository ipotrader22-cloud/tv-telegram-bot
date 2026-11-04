# VIXALE Website — Current-State Manifest (2026-11-04 / PR #359)

**Scope:** VIXALE Website / Design / Copy / Public Pages
**Repository:** `ipotrader22-cloud/tv-telegram-bot`
**Target:** `https://www.vixale.com/dashboard`
**Verification date:** 2026-11-04 (America/New_York)

## Verified source and deployment

- UI change PR: [#359](https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/359), squash merged.
- Main merge SHA: `ce1a0d1df2ad5f20bb83149af5e48461258439eb`, verified from the GitHub `main` branch.
- Render service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`), workspace `tea-d86vflpkh4rs73f3t7n0`.
- Auto-Deploy remains `yes`, trigger `commit`, branch `main`; no settings changed.
- Render deploy: `dep-dblhsinavr4c73cstf20`; SHA matches `ce1a0d1df2ad5f20bb83149af5e48461258439eb`.
- Render status: **live**, completed `2026-11-04T12:01:25.4121Z`.
- Build log: `npm install` completed and Render reported `Build successful` at `12:00:33Z`.
- Startup log: `Server running on port 10000` at `12:01:19Z`; the `npm start` command preloads `website_dashboard_snapshot_refinement.js`.
- The above verifies source/deployment, not a fresh post-deploy authenticated browser rendering.

## Dashboard content and styling

`website_dashboard_snapshot_refinement.js` changes the rendered private Day Trading Dashboard:

- Subtitle: `Private live day-trading dashboard`.
- Vixale Prime note: `Trades only intraday and closes all positions by 16:00 ET`.
- Vixale Edge note: `May hold positions overnight until target or stop is reached`.
- Prime/Edge notes use `white-space:nowrap` and `font-size:12px` at viewport widths `>=1181px`. Below that width, existing responsive grid/layout is retained and text can wrap on small screens.
- Titles, metric values, Open/Pending/Closed tables, API and data sources are unchanged.
- The render-time text replacement matches the prior notes including their trailing periods so the requested new wording has no trailing punctuation.

## Verification performed and limitations

- Connected authenticated dashboard tab, **before** the deployment, confirmed the old subtitle and both previous descriptions.
- GitHub post-write source inspection and PR diff confirmed the exact intended replacement text and responsive CSS.
- `tests/test_dashboard_snapshot_refinement.js` updated with positive and negative assertions for both notes, subtitle, punctuation, and desktop CSS.
- No PR-triggered GitHub Actions/check runs were returned. Independent local Node unit test and Playwright desktop/mobile QA were **NOT RUN**; do not represent test assertions as executed tests.
- Render build and startup passed, establishing the loaded application starts with the committed UI code.
- A connected dashboard tab showed a **502** during the deployment/restart window. A fresh authenticated browser reload and pixel-level single-line/overflow validation after deployment are **UNVERIFIED**. This transient observation alone does not prove a persistent fault after the deploy completed.
- No credential changes, trading-account actions, or business logic changes were performed.

## Boundaries and rollback

Presentation-only change. Does not affect strategy rules, trade lifecycle, target/stop calculations, broker/IBKR/TWS execution, Sheets, P&L calculations, authorization, or environment settings.

Rollback by reverting PR #359's code changes through a new PR, then verify a subsequent Render deployment. Documentation-only follow-up should use `[skip render]` to avoid an unrelated application restart.

## Historical manifest

Previously selected website manifest: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-22-ISSUE337.md`. Its Issue #337 login/session evidence remains historical context and is not newly re-verified by this copy task.

Handbook update required: **NO** (scoped copy and responsive CSS, no contract, endpoint, environment variable, architecture, or schema change).
