# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Day Trading chart marker/date refinement — PR258

Website-facing PR #258, `Refine Day Trading chart markers and date axis`, was squash-merged to `main` as implementation commit `ffe972b117c8547627d2ed4ba9a8e13b8c8a0488`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2bumm7bikc73dqrk6g`.
Verified implementation deploy commit: `ffe972b117c8547627d2ed4ba9a8e13b8c8a0488`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T09:29:35.115983Z`.

A later documentation-only commit/deploy may have a newer SHA without changing the website behavior recorded here. Always re-check GitHub `main`, Render, and the public site before making CURRENT/LATEST/DEPLOYED claims.

## Production behavior

On the public `/trading-systems/day-trading` realized-P&L chart:

- the existing Day Trading realized-equity source and cumulative P&L calculation remain unchanged;
- the existing green realized P&L polyline remains unchanged;
- dense histories render at most 16 evenly distributed circular markers selected from existing authoritative equity points;
- the latest equity point remains marked;
- the X-axis renders up to 6 evenly distributed date labels selected only from existing equity-curve `date` values;
- date labels use `MM/DD`;
- the SVG bottom margin is increased to reserve readable space for the date labels;
- no synthetic/interpolated dates or equity points are created.

## Verification status

Pre-merge scoped verification passed:

- module syntax: PASS;
- test-file syntax: PASS;
- generated inline Day Trading chart script syntax: PASS;
- runtime chart regression: PASS;
- 60 equity points -> 16 circular markers;
- 60 equity points -> 6 date ticks;
- first/last date tick preserved;
- latest equity point remains marked;
- realized P&L polyline remains present;
- latest aria-label value remains accurate.

Render directly verified:

- exact implementation commit `ffe972b117c8547627d2ed4ba9a8e13b8c8a0488` checked out;
- build successful;
- `website_conversion_system_pages_refinement.js` preloaded by `npm start`;
- server reached `Server running on port 10000`;
- exact deploy `dep-db2bumm7bikc73dqrk6g` reached **live**.

Direct visual browser confirmation of the marker/date appearance is **UNVERIFIED** in this maintenance run.

## Data / safety boundary

PR258 does **not** change:

- `/public-performance.json` or its Closed Trades source;
- Day Trading cumulative realized P&L calculations;
- Day Trading open-P&L feed;
- Telegram or Google Sheets lifecycle behavior;
- authentication/viewer behavior;
- Pine, VECO strategy logic, signal generation, entries/exits/stops/targets, sizing, session rules, or risk;
- bridge behavior or TWS/IBKR execution.

## Files changed by PR258

```text
website_conversion_system_pages_refinement.js
tests/test_day_page_chart_refinement.js
```

## Standing owner merge/deploy workflow

A documentation follow-up after PR258 records the owner's 2026-10-06 standing instruction in both `/AGENTS.md` and `/docs/VECO_DEVELOPER_HANDBOOK.md`: eligible normal owner-requested Engineering tasks may proceed from a clean PR through merge and normal production deployment without a second “merge and deploy” confirmation.

The documented rule retains explicit exceptions for failed checks/conflicts, user-requested PR-only stops, unvalidated trading-strategy behavior changes, destructive Git/history, production secrets/environment changes, destructive data migrations/deletions, and separate trading promotion/activation gates.

## Handbook

**Handbook update required: YES for the standing merge/deploy workflow rule.**

The PR258 chart refinement itself is presentation-only and would not otherwise require a handbook update.

## Rollback

For the Day Trading chart refinement, revert PR258 / implementation commit:

```text
ffe972b117c8547627d2ed4ba9a8e13b8c8a0488
```

No trading-state, broker, Pine, or Google Sheet rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR256.md` as the website Current-State manifest. The PR256 manifest remains historical.
