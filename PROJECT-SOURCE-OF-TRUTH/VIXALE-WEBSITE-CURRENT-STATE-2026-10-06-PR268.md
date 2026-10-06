# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Public navigation Help / Log In overlap fix — PR268

Website-facing PR #268, `Fix Help and Log In overlap in desktop public navigation`, was squash-merged to `main` as implementation commit:

```text
b42e607a98e12332c1b8876e518a747696280278
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Verified implementation deploy: `dep-db2er7u7bikc73duitj0`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T12:47:12.038951Z`.

PR verification:
- workflow: **Production EN/RU Browser QA**
- PR run: **#148**
- result: **SUCCESS**

## Production behavior

The compact desktop public-navigation range now applies from 1001px through 1380px rather than ending at 1180px. Within that range:

- primary/action column gap is reduced to 10px;
- primary nav item gap is reduced to 8px;
- existing compact font/action sizing remains active;
- all primary menu items, Log In, and Live Access remain present.

This fixes the medium-desktop overlap where Help could collide with Log In after Daily Recaps was added.

## Files changed by PR268

```text
website_public_navigation_alignment.js
tests/test_issue123_pr1_direct_navigation.js
```

## Safety boundary

Presentation-only responsive CSS. No route, copy, trading logic, Pine, bridge/TWS/IBKR, Telegram, Google Sheets, authentication behavior, environment, or secret changes.

## Handbook

**Handbook update required: NO.**

The documented navigation contract did not change; this is an isolated responsive layout correction.

## Rollback

Revert PR268 / implementation commit `b42e607a98e12332c1b8876e518a747696280278` and allow the normal Render deployment.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR266.md`. The PR266 manifest remains historical.
