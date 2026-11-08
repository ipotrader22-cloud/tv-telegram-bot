## 2026-11-08 — Engine 2 Swing production rollout

PR #379 merged; production code `402931e73904e6e2b39de342212dc04a1fc88afa`, final ENGINE2 deployment `dep-dbo8frpsrm7s73b8ip20` Live at 14:32:54 UTC. Authenticated EN/RU page/API parity, actual LEGACY rollback and ENGINE2 restoration passed. November 6 snapshot: zero active, five candidates, model P&L -1011.37. Production data access is read-only. See `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-08-ENGINE2.md` and `docs/releases/ENGINE2_SWING_ROLLOUT.md`. Monday market-cycle completion is not asserted.

## 2026-11-06 — PR #380 homepage intro video

- Merged homepage video PR #380 to `main` as `1668433afb08379b9ba5664bf5d7acbcb56e7f2d`; Render deploy `dep-dbn6j8lckfvc73ft04a0` directly reported live at 2026-11-06 23:59:14Z.
- EN/RU 55-second intro video after system preview and before Day/Swing/Options cards; hero link, responsive 16:9 player, no autoplay, illustrative-content caveat and HeyGen fallback.
- PR workflow `42315245695` success; locale-contract suite passed including `tests/test_home_intro_video.js`. PR browser-qa job skipped. Source/V8 homepage rendering checks passed.
- External media playback and fresh production EN/RU desktop/mobile screenshots NOT RUN / UNVERIFIED; cached public crawler result is not a live check. HeyGen-hosted media, not uploaded MP4 binary.
- Details: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-06-PR380.md`. No trading engine, order, broker, Sheets, auth or route changes. Handbook updated; docs exporter/upload not performed.

# VIXALE website — Current state

## 2026-11-04 — PR #361: corrected private dashboard subtitle and compact cards

- Direct authenticated pre-fix browser read confirmed old `Private live day-trading forward-test / paper-trading tracker` after PR359. Root cause: regex expected only raw subtitle before another website refinement prepended `day-trading`.
- PR361 code SHA `453a9cf2a4f2bf6a3600c3f370869d9176441997`; Render deploy `dep-dbli4fqvcj2c738p8dng` reported **live** at 12:17:55Z with successful build and startup.
- Actual renderer targeted JS tests passed for raw EN, previously refined EN and unchanged RU cases. Chromium *mock* layouts checked 1440/1280/1181/1180/390/320px, no horizontal overflow, compact ~50px desktop cards and subtitle-row alignment. Full repo CI/production pixel inspection NOT RUN.
- Browser tab retained a restart-window 502 after deploy; no available browser navigation action to reload. Authenticated page text after deploy remains UNVERIFIED. Details and constraints: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR361.md`.
- No trading, broker, data, session or API changes. Handbook update not required; central documentation export and upload not performed.

## 2026-11-04 — Dashboard UI copy, PR #359 verified deploy

- GitHub main UI SHA `ce1a0d1df2ad5f20bb83149af5e48461258439eb`; Render deployment `dep-dblhsinavr4c73cstf20` reported Live at 2026-11-04T12:01:25Z. Render build and server startup successful.
- Source: `website_dashboard_snapshot_refinement.js`; tests updated: `tests/test_dashboard_snapshot_refinement.js`. Subtitle and Prime/Edge descriptions match owner wording exactly, desktop notes set to one line at >=1181px with responsive wrapping below.
- Connected authenticated browser **before** deploy confirmed old text; fresh authenticated browser post-deploy and visual responsive QA **NOT RUN / UNVERIFIED**. A tab showed 502 during rollout. No PR-triggered CI runs were found; independent Node regression tests were not executed.
- Source-of-truth details: `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-11-04-PR359.md`. UI presentation only; no trading, broker, session, API, or financial-data changes.
- Handbook change: not required. Documentation follow-up is separate from app deploy. Docs export/upload not performed (central exporter and local registry unavailable in this environment).

## Current column emphasis — 2026-09-28 source change

`feature/swing-current-bold`, based on PR222 merge `54d0ec8`, adds one scoped
CSS rule in `website_swing_active_model_pnl.js`: Active Portfolio Current cells
use font-weight 700. Styling persists through the unchanged textContent quote
updates. No calculation, source, API, trading or lifecycle changes.
Handbook update required: NO (isolated typography, no structure/contract change).
Deployment verification is recorded separately after merge.

## Deployment verification — 2026-09-28 UTC

PR #221 is merged. Render deployment dep-dat5lj7pn0mc73b0ipm0 is live on
bdaa42a086ad3fdcb684179c614bb31d56bc582c (verified by Render deployment API
and startup logs). Live EN/RU TP/SL checks passed for eight positions at
1440px and 390px. Full-page mobile navigation overflow is recorded separately.
See PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-28-PR221.md
for exact evidence, the deployment trigger, QA results and limitations.
The proposed-work records below describe the earlier pre-merge stage only.

## Proposed TP/SL display change — verified 2026-09-28 UTC

- Branch: `feature/swing-tp-sl-display`, based on fetched `origin/main`
  `e3f94a1fc9e40287a2ad2c2c143603e20fb9beb7` (GitHub fetch verified this session).
- Working checkout: `C:\Users\tradi\.codex\.chatgpt-projects\g-p-6a8054bf92f08191a73ed5045fcb556a\swing-tp-sl`.
- Implementation: `website_swing_active_model_pnl.js`; TP = Entry * 1.10,
  SL = Entry * 0.95, between Quantity and P&L, $. Dollar prices use two decimals.
  Entry $607.00 displays TP $667.70 and SL $576.65.
- Presentation only. Existing daily-close explanation, data sources, API fields,
  cache/fallback/refresh behavior, trading rules and execution remain unchanged.
- PASS: Node syntax checks for implementation, unit test, browser QA and app.js;
  `test_swing_active_model_pnl`, `test_swing_active_portfolio_rules`,
  `test_swing_leaders`, `test_swing_leaders_app_integration`,
  `test_swing_leaders_candidate_feed_compat`, `test_issue107_swing_navigation_ctas`.
- PASS: `scripts/qa-swing-reference-prices.js`, offline Chrome/Playwright EN/RU at
  1440, 1024, 768, 390 and 320 px. Checked column order, price rounding, quote
  refresh preserving TP/SL, rule copy, mobile labels and no page overflow.
  Desktop EN and mobile RU screenshots visually inspected.
- Two pre-existing failures reproduced in the untouched original checkout:
  `test_swing_canonical_route_refinement.js:63` expects the obsolete
  `Watch Systems for Free` CTA; `test_swing_ui_refinement.js:14` expects an old
  preload prefix. Relevant files match origin/main. No unrelated fix included.
- No build script exists in package.json. Full live app/Sheets/broker execution
  NOT RUN. Deployment and live TP/SL behavior UNVERIFIED; no merge/deploy performed.
- The website PROJECT-MEMORY files were carried forward from the existing local
  documentation branch, preserving their prior evidence below. They supplement,
  and do not supersede, the dated runtime authority selected by MASTER-INDEX.
- Documentation export: central `export-docs.py` run successfully with a staged
  registry mapping existing allowlisted files to this feature checkout. Four
  local bundles generated; website bundle reviewed for TP/SL records and source
  paths. Output: sibling `documentation-export/02-VIXALE-Website.md` in the
  ChatGPT workspace. No central registry changes or network/upload calls.
  Upload NOT PERFORMED.

## Previously recorded documentation evidence

Documentation inspection: 2026-09-28T02:01:47+00:00. This is not a new live-validation timestamp.

## Authority

Working root: `C:\Users\tradi\Documents\GitHub\tv-telegram-bot`

ChatGPT destination: **VIXALE — Website / Design / Copy** (`g-p-6a8054bf92f08191a73ed5045fcb556a`).

Mapping: Name/scope match; project existence verified. Upload not performed.

## Version / baseline

Existing website authority: VIXALE-WEBSITE-CURRENT-STATE-2026-09-27-PR217.md.

## Verification and tests

- Existing MASTER-INDEX selects the September 27 PR217 state, not the older undated manifest.
- Existing manifest records deployment b190b1e5 and production QA success; these are prior recorded evidence, not new live checks.

## Unresolved issues

- Live website and Render were not rechecked. Do not equate latest documentation commit with deployed application.

## Observed source fingerprints

These hashes identify inspected files, not live deployment health.

- `app.js`: `616548454b78caa0bd52310a21e84804db237bf4da9a29ad069a49c55d7bed41`
- `package.json`: `d160f79e4d6bee9e8eb209a50f8780def292bd7d7adf6060863965506a76324b`

Current emphasis validation (2026-09-28): node syntax, Active Portfolio and
rules regressions PASS. Offline Chrome EN/RU at 1440/1024/768/390/320px PASS,
including computed Current font-weight 700 after quote refresh and preserved
TP/SL values. git diff --check PASS.


## Proposed Day Trading hero-card refinement

Branch: `fix/day-signals-card-alignment-20260929`, based on freshly fetched
`origin/main` at `46a4b4f`. This feature branch is not deployed. The production
manifest selected by MASTER-INDEX is now the September 29 PR235 manifest;
earlier baseline references above remain historical.

Only card CSS and a SHORT presentation class change in the Day Trading
refinement. Five public closed trades, source request, P&L classifications,
CTAs, Live Overview and protected Open/Pending boundaries remain unchanged.
Local EN/RU browser checks passed at 1440/1024/768/390/320px with fixture trades:
card raised 14px on desktop, pricing alignment within 3.3px, correct direction
and P&L colors, weights 400/500, stacked mobile with no horizontal overflow.
Syntax, recent-signals renderer, dedicated Day chart and Closed Trades archive
regressions passed. Screenshots contain synthetic test data, not live results.
Handbook updated. No merge or deployment performed.
