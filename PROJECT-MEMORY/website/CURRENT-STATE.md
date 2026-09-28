# VIXALE website — Current state

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
