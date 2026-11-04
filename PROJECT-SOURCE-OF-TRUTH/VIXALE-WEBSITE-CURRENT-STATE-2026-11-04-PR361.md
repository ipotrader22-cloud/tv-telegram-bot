# VIXALE Website — Current-State Manifest (2026-11-04 / PR #361)

**Project:** VIXALE — Website / Design / Copy / Public Pages
**Target:** https://www.vixale.com/dashboard
**Repository:** `ipotrader22-cloud/tv-telegram-bot`
**Evidence checked:** 2026-11-04 (America/New_York)

## Verified repository and deployment

- PR #361, `Fix live dashboard subtitle and compact Prime/Edge cards`, merged to `main`.
- UI code commit: `453a9cf2a4f2bf6a3600c3f370869d9176441997`.
- Render service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`), workspace `tea-d86vflpkh4rs73f3t7n0`.
- Auto-Deploy uses `main` on new commits; no Render settings were changed.
- Deploy `dep-dbli4fqvcj2c738p8dng` reports **live**, same UI commit, completed `2026-11-04T12:17:55.241592Z`. The build succeeded and startup logs reported `Server running on port 10000` at `12:17:44.715Z`.
- This is direct deployed-source evidence, not a post-deploy authenticated screenshot.

## Observed defect and fix

The authenticated EN dashboard, read directly in the connected browser **before** PR #361, still displayed `Private live day-trading forward-test / paper-trading tracker` after PR #359, despite the Prime/Edge description edits having applied.

Root cause: `website_dashboard_snapshot_refinement.js` matched only the raw `Private live forward-test / paper-trading tracker`. Another prior website refinement had already inserted `day-trading` into the title before the snapshot refinement's exact-text replacement.

PR #361 fixes both variants and renders **Private live day-trading dashboard**. The strategy descriptions remain the owner-requested copy:

- Vixale Prime: `Trades only intraday and closes all positions by 16:00 ET`.
- Vixale Edge: `May hold positions overnight until target or stop is reached`.

Desktop layout now uses a two-row header: heading and tracking badge on row one, then subtitle + two compact system cards on row two. Cards use content-height rather than forced 100% grid height, 8px vertical / 12px horizontal padding, 6px desktop offset to align top edges with subtitle text, and single-line notes at widths >1180px. At <=1180px, the grid stacks and the descriptions can wrap. Other dashboard metrics, tables and data bindings are preserved.

## Checks executed

- Executed the **actual GitHub branch** `website_dashboard_snapshot_refinement.js` implementation in isolated JavaScript with HTML that models the app's dashboard output; passed two EN cases (raw and already-refined actual production subtitle variant) and one RU case (preserves Russian subtitle/notes). Each case checked subtitle or unchanged RU copy, header/strategy note extraction, updated position, other strategy note preserved, compact CSS emitted, mobile reset and idempotency.
- Executed Chromium layout checks on a standalone mock reproducing the dashboard's inspected HTML/CSS at 1440, 1280, 1181, 1180, 390 and 320 px. Checks showed no horizontal overflow; cards were 50px high at desktop widths and approximately 1px vertically offset from subtitle top. Mobile layout stacked correctly. **This was not a direct live authenticated visual measurement**.
- PR #361 diff contained only `website_dashboard_snapshot_refinement.js` and `tests/test_dashboard_snapshot_refinement.js`. The dedicated regression assertions were updated; a full repo Node test run and GitHub Actions run were **NOT RUN**.
- Render build and startup passed with the specific merged code SHA.
- The connected authenticated browser tab showed a transient **502** during the Render restart. The browser connector can only read tab contents and could not force-reload the tab afterward; authenticated live page text and pixel geometry **remain UNVERIFIED** after this deploy. Do not claim they were checked.
- An anonymous web fetch redirected `/dashboard` to `/login`; this is not an authenticated dashboard confirmation.

## Scope boundary and limitations

No change to VECO/SMIO strategies, target/stop calculations, trade lifecycle, order/risk logic, IBKR/TWS bridge, Google Sheets, authentication, data sources or production environment variables. Existing dependency audit warnings were not addressed by this scoped copy task.

Rollback: revert the UI PR #361 code merge through a reviewed PR and confirm the resulting Render deploy. Historical website source-of-truth: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR359.md`.

Developer handbook: **no changes required** (presentation-only copy and CSS; no API/schema/config/startup contract change).

Documentation export/upload: **NOT PERFORMED** (central local exporter and mapped upload environment are not available here). Documentation follow-up uses `[skip render]` to avoid restarting the running service.
