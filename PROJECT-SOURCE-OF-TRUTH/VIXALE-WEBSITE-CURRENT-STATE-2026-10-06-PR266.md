# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Daily Recaps homepage + primary navigation promotion — PR266

Website-facing PR #266, `Promote Daily Trading Recaps on homepage and main navigation`, was squash-merged to `main` as implementation commit:

```text
e99005f36650ac924067e6c34aabf7637eaa5a1c
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2el0navr4c73ajr7ig`.
Verified implementation deploy commit: `e99005f36650ac924067e6c34aabf7637eaa5a1c`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T12:33:46.7844Z`.

PR verification:
- workflow: **Production EN/RU Browser QA**
- PR run: **#146**
- result: **SUCCESS**
- included unified navigation/homepage CTA regressions and Russian localization regressions.

## Production source behavior

The homepage hero now promotes the public recap archive with a prominent first action:

```text
Daily Trading Recaps -> /daily-trading-summary
```

The existing Telegram Signals action remains the existing primary sales CTA; Daily Trading Recaps receives a distinct soft-green visible treatment.

The unified primary menu now uses:

```text
Daily Recaps -> /daily-trading-summary
```

in the former **About** primary-navigation slot. About remains available through secondary/footer navigation; it is not removed from the website.

The unified public-navigation contract also treats:

```text
/daily-trading-summary
/daily-trading-summary/YYYY-MM-DD
```

as public navigation routes, with Daily Recaps marked active on the archive and dated permalink pages.

Russian navigation/localization contract:
- `Daily Recaps` -> `Ежедневные итоги`
- `Daily Trading Recaps` -> `Ежедневные торговые итоги`

## Verification notes

Scoped pre-merge checks passed:
- JavaScript syntax: PASS;
- Daily Recaps primary-menu placement: PASS;
- About retained in secondary/footer only: PASS;
- dated recap active-state navigation: PASS;
- homepage recap CTA appears before Telegram Signals: PASS;
- distinct homepage CTA styling: PASS;
- RU labels: PASS;
- handbook update: PASS.

Render verification:
- exact implementation commit checked out;
- build completed successfully;
- deploy reached **live**.

A direct external crawler request immediately after deploy still returned an older cached homepage without the new CTA/menu. Therefore the crawler-visible homepage state is **UNVERIFIED / STALE-CACHE OBSERVED** in this maintenance run; it is not evidence that the Render deployment failed. Do not replace this statement with a direct-crawler success claim unless a fresh public fetch observes the new elements.

## Files changed by PR266

```text
website_conversion_home_refinement.js
website_conversion_navigation_refinement.js
tests/test_issue123_pr1_direct_navigation.js
tests/test_issue123_pr2_homepage_preview.js
docs/VECO_DEVELOPER_HANDBOOK.md
```

## Safety boundary

PR266 does **not** change:
- Pine or TradingView strategy behavior;
- trading entries, exits, stops, targets, sizing, timeframe, session, or risk;
- bridge/TWS/IBKR execution;
- Telegram lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer-code behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: YES — completed in PR266.**

ADR-023 now records Daily Trading Recaps as a first-class public discovery route and the primary/secondary navigation ownership boundary.

## Rollback

Revert PR266 / implementation commit:

```text
e99005f36650ac924067e6c34aabf7637eaa5a1c
```

then allow the normal Render deployment. No trading-state, broker, Pine, Google Sheets, or customer-data rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR264.md`. The PR264 manifest remains historical.
