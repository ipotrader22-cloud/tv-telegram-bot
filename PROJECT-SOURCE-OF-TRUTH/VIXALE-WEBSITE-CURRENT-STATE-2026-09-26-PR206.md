# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-26 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing runtime state:

- **Swing current Total Model P&L PR:** #206 — `Keep Swing Total Model P&L current intraday` — MERGED
- **Implementation / runtime SHA:** `11943c6672add9083c027e7b41884281879f718e`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-darr1cavcj2c73a8chhg`
- **Verified Render deploy commit:** `11943c6672add9083c027e7b41884281879f718e`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36239890073` (run #70)
- **Production QA head SHA:** `11943c6672add9083c027e7b41884281879f718e`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-26-PR204.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For operational claims, still re-check GitHub `main`, the active Render deploy, and live production QA.

## Swing P&L presentation

Canonical public route:

```text
/trading-systems/swing-trading
```

The public page now distinguishes the **current total** from the immutable historical curve:

- `Unrealized Model P&L` remains the current Active Portfolio aggregate from `active_unrealized_model_pnl`.
- `Realized Model P&L` remains the Closed Trades aggregate from `closed_realized_model_pnl`.
- the large summary in the Equity History card is labeled `Total Model P&L` and equals:

```text
active_unrealized_model_pnl + closed_realized_model_pnl
```

- the current total is refreshed with the same existing one-minute visible-page `/api/swing-leaders` refresh used for Active Portfolio valuation.
- the historical line and plotted points remain sourced only from immutable Trading Lab `Equity History.total_model_pnl` rows.
- an intraday current total may therefore differ from the last historical point without altering history.

For the user-reported example, a visible Unrealized Model P&L of `+$1,339.00` and Realized Model P&L of `+$809.00` correspond to a current Total Model P&L of `+$2,148.00`; the prior `+$1,795.70` headline was the latest historical Equity History snapshot rather than the current total.

## Data and strategy boundaries

PR #206 does **not** change:

- Trading Lab scoring or stock selection;
- Active Portfolio membership;
- entry or exit rules;
- target or stop logic;
- fixed-$10K model-accounting methodology;
- Public Feed schema or writer automation;
- Equity History rows, calculations, or history points;
- Google Sheets refresh cadence;
- `GOOGLEFINANCE` as the validated Swing quote source;
- broker/TWS/IBKR execution;
- VECO/Pine/UAM behavior;
- Telegram lifecycle.

This is a website presentation-consistency correction only.

## Implementation files

PR #206 changed:

```text
website_swing_active_model_pnl.js
tests/test_swing_active_model_pnl.js
docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md
```

## Verification details

Implementation merge:

```text
GitHub main commit:
11943c6672add9083c027e7b41884281879f718e

Render deploy:
dep-darr1cavcj2c73a8chhg
status: live
commit: 11943c6672add9083c027e7b41884281879f718e

GitHub Actions:
Production EN/RU Browser QA
run id: 36239890073
run number: 70
status: completed
conclusion: success
head SHA: 11943c6672add9083c027e7b41884281879f718e
```

The pre-merge locale-contract workflow passed syntax checks, the focused Swing intraday/current-total regression, owner-copy/PDF regressions, Services RU parity, and existing Russian localization regressions.

The post-merge production browser QA completed successfully after the exact Render deployment reached `live`. EN/RU production browser QA, owner-copy/Trading Guide live verification, RU Services form-control QA, and artifact upload all completed successfully.

## Handbook

The current-vs-historical P&L distinction is documented in:

`docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md`

Handbook update required for PR #206: **YES — completed in the PR**.

## Rollback

To roll back this presentation correction, revert PR #206 / merge commit:

```text
11943c6672add9083c027e7b41884281879f718e
```

No Trading Lab strategy state, Google Sheet ledger state, broker execution state, Equity History state, or quote-provider rollback is required.