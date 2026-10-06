# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Container-safe desktop public navigation — PR270

Website-facing PR #270, `Make desktop public navigation container-safe`, was squash-merged to `main` as implementation commit:

```text
97c2df1e7e969950af75e6e31675c8721014607b
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Verified implementation deploy: `dep-db2evb3l550s73cd0o90`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T12:56:01.376429Z`.

PR verification:
- workflow: **Production EN/RU Browser QA**
- PR run: **#150**
- result: **SUCCESS**

## Root cause

PR268 attempted to prevent Help / Log In overlap using a viewport-bound media query. That was not robust because the public header is constrained by its inner layout/container; the viewport can be wide while the header's available menu width remains limited.

## Production source behavior

For all desktop widths at or above 1001px, the unified public-navigation alignment now uses the compact spacing directly instead of waiting for a max-width breakpoint:

- primary/action grid column gap: 10px;
- primary nav link gap: 8px;
- primary nav font size: 12.5px;
- Log In font size: 13px;
- Live Access uses the compact 44px height / 16px horizontal padding / 12.5px type;
- all menu items and routes remain unchanged.

The previous `max-width:1380px` dependency is removed.

## Verification state

Source and deployment verification are complete:
- exact implementation commit checked out by Render;
- build completed;
- service reached live;
- PR browser QA passed.

The owner-reported overlap is a visual/layout issue. **Owner visual verification after reload is still pending** for this exact PR270 deployment; do not claim the overlap is visibly resolved until the owner confirms or an equivalent fresh browser check at the affected viewport proves it.

## Files changed by PR270

```text
website_public_navigation_alignment.js
tests/test_issue123_pr1_direct_navigation.js
```

## Safety boundary

Presentation-only responsive CSS. No route, copy, trading logic, Pine, bridge/TWS/IBKR, Telegram, Google Sheets, authentication behavior, environment, or secret changes.

## Handbook

**Handbook update required: NO.**

This is an implementation correction of the existing navigation contract.

## Rollback

Revert PR270 / implementation commit `97c2df1e7e969950af75e6e31675c8721014607b` and allow the normal Render deployment.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR268.md`. The PR268 manifest remains historical.
