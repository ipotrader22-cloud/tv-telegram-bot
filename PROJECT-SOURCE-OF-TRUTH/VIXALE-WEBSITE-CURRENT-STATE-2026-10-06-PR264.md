# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Daily Trading Summary history restoration + Options results — PR264

Website-facing PR #264, `Restore early daily recap history and show Options results`, was squash-merged to `main` as implementation commit:

```text
4e865ceef81bf604779fd1bd1a57a7c9451c83d8
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2eb6jl550s73cc4tdg`.
Verified implementation deploy commit: `4e865ceef81bf604779fd1bd1a57a7c9451c83d8`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T12:12:51.905277Z`.

A later documentation-only commit/deploy may have a newer SHA without changing this website behavior.

## Production behavior

Daily Trading Summary routes remain:

```text
/daily-trading-summary
/daily-trading-summary/YYYY-MM-DD
```

Archive behavior:

- the erroneous October 5, 2026 publication cutoff introduced by PR262 is removed;
- every activity date available from the authoritative ledger may appear in the archive, including dates before October 5, 2026;
- there is no fixed 45-day rolling cap;
- valid historical date permalinks remain addressable as long as authoritative activity exists for that date;
- existing privacy boundaries remain unchanged.

Closed Options activity shown inside a dated daily recap now includes a visible **Result** value. That value is not a new formula: the daily recap reuses the existing canonical `optionPnl()` calculation exported by `website_options_canonical_refinement.js`, using the recorded Credit/Debit direction, entry price, exit price, contracts, multiplier, and fees.

Open Option Journal positions, notes, internal IDs, brokerage-proof paths, and other private fields remain unpublished.

## Verification

Scoped pre-merge verification passed:

- daily-summary module syntax: PASS;
- test-file syntax: PASS;
- an earlier date (2026-10-04) is restored to archive output: PASS;
- synthetic 61-date history including 2026-07-01 remains untrimmed: PASS;
- canonical Options `optionPnl()` reuse: PASS;
- per-trade Options Result rendering: PASS;
- private Option Journal Notes remain hidden: PASS;
- feature branch was ahead of `main` and not behind before merge.

Render verification:

- exact implementation commit `4e865ceef81bf604779fd1bd1a57a7c9451c83d8` checked out;
- build completed successfully;
- production startup loaded `website_daily_trading_summary.js`;
- server reached `Server running on port 10000`;
- exact deploy `dep-db2eb6jl550s73cc4tdg` reached **live**.

The available external crawler was not used as proof of the dated route in this maintenance run; the owner had already confirmed the Daily Trading Summary route works. Deployment claims above are based on GitHub/Render authoritative state.

## Files changed by PR264

```text
website_daily_trading_summary.js
tests/test_daily_trading_summary.js
docs/VECO_DEVELOPER_HANDBOOK.md
```

## Safety boundary

PR264 does **not** change:

- Pine or TradingView strategy behavior;
- entry, exit, stop, target, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: YES — completed in PR264.**

The Daily Trading Summary ADR now records full available-history publication and canonical Options Result reuse.

## Rollback

Revert PR264 / implementation commit:

```text
4e865ceef81bf604779fd1bd1a57a7c9451c83d8
```

and allow the normal Render deployment. No trading-state, broker, Pine, Google Sheets, or Option Journal rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR262.md`. The PR262 manifest remains historical.
