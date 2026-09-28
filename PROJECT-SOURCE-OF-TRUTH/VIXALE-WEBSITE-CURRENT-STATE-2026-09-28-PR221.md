# VIXALE Website — Current-State Manifest

Project: VIXALE Website / Design / Copy / Public Pages
Verification: 2026-09-28 UTC
Repository: ipotrader22-cloud/tv-telegram-bot; branch main

## Verified deployment

- PR #221 merged at 2026-09-28T12:14:05Z.
- Implementation commit: 99658011b5c11231a2c9d8cf52143447c08598cb.
- Merge/deployed commit: bdaa42a086ad3fdcb684179c614bb31d56bc582c.
- Render service: tv-telegram-bot (srv-d86vh7j7uimc73ao479g).
- Deploy: dep-dat5lj7pn0mc73b0ipm0; status live; finished 2026-09-28T12:17:58.534173Z.
- Render startup log: Server running on port 10000 at 12:17:55Z; service live log at 12:17:58Z.
- No error-level logs returned for 12:18:00–12:21:37Z.
- Auto-deploy is configured for main/commit, but no deployment appeared after merge during the observed interval. After checking deployment history and build logs, the explicitly authorized deployment was triggered via API. Do not infer the cause of the missing auto-trigger.

## Active Portfolio display

TP and SL appear between Quantity and P&L, $. TP = Entry * 1.10; SL = Entry * 0.95. Currency is USD with two decimal places. SL remains a reference price; the existing daily-close rule above the table is unchanged. No trading, execution, lifecycle, authoritative data source or API/Sheet schema changed.

## Live verification

Read-only Chrome/Playwright checks passed on https://www.vixale.com/trading-systems/swing-trading and https://ru.vixale.com/trading-systems/swing-trading at 1440px and 390px. Each response was HTTP 200; all eight positions had the expected TP/SL values, column order, daily-close text and responsive table layout. Example observed AMD Entry $607.84, TP $668.62, SL $577.45. Desktop screenshot visually inspected.

Separate limitation: the whole page overflows horizontally at 390px because of the upper nav/nav-links/vx-unified-public-nav and nav actions (EN scroll width 686px; RU 783px). Overflowing elements are outside the Active Portfolio table and their implementation was not changed by PR #221. Do not describe full-page mobile QA as clean.

GitHub production QA run 36420523488: locale-contract passed. First browser attempt overlapped deployment and reported HTTP 502 plus missing markup; a failed-job rerun was requested after Live. Rerun attempt 2: EN/RU production browser QA, canonical favicon, owner copy/Trading Guide PDF, and RU Services form-control steps all passed. The separate mobile-nav limitation above is outside the assertions of this existing workflow.

## Documentation and rollback

This manifest supersedes the PR217 manifest for TP/SL deployment status; previous favicon evidence remains recorded there. Handbook update required: NO for this deployment-only record (implementation handbook update was included in PR #221).

Rollback: revert PR #221 / merge bdaa42a086ad3fdcb684179c614bb31d56bc582c and deploy only with owner authorization. No data migration, broker operation or trading rollback is needed for the display change.
