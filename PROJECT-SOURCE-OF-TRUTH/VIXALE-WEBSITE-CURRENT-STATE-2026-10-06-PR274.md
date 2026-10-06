# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Swing How-card copy rebalance — PR274

Website-facing PR #274, `Move Swing ranking-removal note to Closed Trades card`, was squash-merged to `main` as implementation commit:

```text
5052376eeaac797fec9f681dc3941243a7f9f8fa
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Verified implementation deploy: `dep-db2fga67bikc73dvgolg`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T13:32:15.041305Z`.

## Production source behavior

On `/trading-systems/swing-trading`, the sentence:

```text
Position can also be removed from Active Portfolio if ranking goes below 70.
```

is displayed in the **Closed Trades** card inside `How Swing Leaders Works`.

The sentence was removed from **Position size and exits** and appears exactly once.

This is copy placement only; Swing ranking/scoring behavior and portfolio logic are unchanged.

## Verification

Scoped checks passed:

- `website_swing_ui_refinement.js` syntax: PASS;
- `tests/test_swing_ui_refinement.js` syntax: PASS;
- ranking-removal note is present in Closed Trades: PASS;
- ranking-removal note is absent from Position size and exits: PASS;
- ranking-removal note appears exactly once: PASS.

Render verification:

- exact implementation commit `5052376eeaac797fec9f681dc3941243a7f9f8fa` checked out;
- build completed successfully;
- production startup loaded `website_swing_ui_refinement.js`;
- exact deploy `dep-db2fga67bikc73dvgolg` reached **live**.

## Files changed by PR274

```text
website_swing_ui_refinement.js
tests/test_swing_ui_refinement.js
```

## Safety boundary

PR274 does **not** change:

- Swing ranking/scoring logic;
- Active Portfolio/Candidates/Closed Trades feed semantics;
- model allocation or Model P&L calculations;
- Pine or TradingView strategy behavior;
- entry, exit, stop, target, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: NO.**

This is an isolated copy-placement adjustment within an existing Swing UI block.

## Rollback

Revert PR274 / implementation commit:

```text
5052376eeaac797fec9f681dc3941243a7f9f8fa
```

and allow the normal Render deployment.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR272.md`. The PR272 manifest remains historical.
