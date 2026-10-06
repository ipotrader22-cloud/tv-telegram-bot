# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Daily Trading Summary full-history archive — PR262

Website-facing PR #262, `Keep full daily trading summary history`, was squash-merged to `main` as implementation commit:

```text
23239fbb6f745cb40898521d2775fa2104fb26c6
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2e6qk9v7es738e9250`.
Verified implementation deploy commit: `23239fbb6f745cb40898521d2775fa2104fb26c6`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T12:03:43.063555Z`.

A later documentation-only commit/deploy may have a newer SHA without changing this website behavior.

## Production behavior

The Daily Trading Summary public journal now has a fixed publication start date:

```text
2026-10-05
```

The archive route remains:

```text
/daily-trading-summary
```

and dated permalinks remain:

```text
/daily-trading-summary/YYYY-MM-DD
```

Behavior:

- October 5, 2026 is the first public blog post date.
- Activity dates before October 5, 2026 are excluded from the archive.
- Dated recap routes before October 5, 2026 return the existing not-found response.
- The prior 45-activity-day archive cap is removed.
- All published activity dates from October 5, 2026 forward remain in the archive as history grows.
- Existing public/private data boundaries from PR260 remain unchanged.

## Verification

Scoped pre-merge verification passed:

- module syntax: PASS;
- test-file syntax: PASS;
- start-date boundary: PASS;
- 60-day synthetic archive remains untrimmed: PASS;
- oldest published date remains `2026-10-05`: PASS;
- branch was ahead of `main` and not behind before merge.

Render verification:

- exact implementation commit `23239fbb6f745cb40898521d2775fa2104fb26c6` checked out;
- build completed successfully;
- exact deploy `dep-db2e6qk9v7es738e9250` reached **live**.

Direct external route retrieval remains **UNVERIFIED** from the available crawler because that tool cannot access the Vixale daily-summary route. The owner previously confirmed the recap route itself works, but this maintenance run does not convert crawler failure into a browser-verification claim.

## Files changed by PR262

```text
website_daily_trading_summary.js
tests/test_daily_trading_summary.js
docs/VECO_DEVELOPER_HANDBOOK.md
```

## Safety boundary

PR262 does **not** change:

- Pine or TradingView strategy behavior;
- entries, exits, stops, targets, sizing, timeframe, sessions, or risk;
- bridge/TWS/IBKR execution;
- Telegram lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: YES — completed in PR262.**

The Daily Trading Summary ADR now records the permanent-history policy and October 5, 2026 start boundary.

## Rollback

Revert PR262 / implementation commit:

```text
23239fbb6f745cb40898521d2775fa2104fb26c6
```

and redeploy the prior confirmed website commit. No trading-state, broker, Pine, Google Sheets, or Option Journal rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR260.md`. The PR260 manifest remains historical.
