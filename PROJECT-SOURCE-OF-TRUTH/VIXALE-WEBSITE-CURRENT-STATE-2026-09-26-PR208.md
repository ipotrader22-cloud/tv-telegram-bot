# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-26 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing runtime state:

- **Homepage Swing current Total Model P&L PR:** #208 — `Use current Swing total P&L on homepage preview` — MERGED
- **Implementation / runtime SHA:** `a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-darrfvgae00c73ah9t5g`
- **Verified Render deploy commit:** `a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36241485112` (run #72)
- **Production QA head SHA:** `a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-26-PR206.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For operational claims, still re-check GitHub `main`, the active Render deploy, and live production QA.

## Swing current P&L presentation

Canonical public Swing route:

```text
/trading-systems/swing-trading
```

Current Swing totals continue to use the PR #206 contract:

- `Unrealized Model P&L` comes from `active_unrealized_model_pnl`.
- `Realized Model P&L` comes from `closed_realized_model_pnl`.
- current `Total Model P&L` equals:

```text
active_unrealized_model_pnl + closed_realized_model_pnl
```

- the Equity History line and plotted points remain sourced only from immutable Trading Lab `Equity History.total_model_pnl` rows.
- intraday/current totals may therefore differ from the last historical point without altering history.

## Homepage Swing preview

Canonical homepage route:

```text
/
```

The Swing Trading tab now follows the same current-total semantics as the Swing page:

- it reuses the existing sanitized `/api/swing-leaders` endpoint;
- `Open positions` comes from `active_count`;
- `Potential candidates` comes from `intern_count`;
- `Total model P&L` is calculated as `active_unrealized_model_pnl + closed_realized_model_pnl` from the current API response;
- it no longer uses the latest `equity_history.total_model_pnl` point as the current homepage total;
- it remains an on-demand tab preview and does not add independent interval polling.

This fixes the user-visible mismatch where the homepage could show the prior historical `+$1,795.70` snapshot while the current Swing page totals implied a different current total such as `+$2,148.00`.

## Data and strategy boundaries

PR #208 does **not** change:

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
- Telegram lifecycle;
- authentication, pricing, or customer access behavior.

This is a website presentation-consistency correction only.

## Implementation files

PR #208 changed:

```text
website_conversion_home_refinement.js
tests/test_issue123_pr2_homepage_preview.js
docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md
```

## Verification details

Implementation merge:

```text
GitHub main commit:
a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c

Render deploy:
dep-darrfvgae00c73ah9t5g
status: live
commit: a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c

GitHub Actions:
Production EN/RU Browser QA
run id: 36241485112
run number: 72
status: completed
conclusion: success
head SHA: a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c
```

Pre-merge locale-contract checks passed, including syntax checks, unified navigation/homepage regressions, Swing intraday regression, owner-copy/PDF regressions, Services RU parity, and existing Russian localization regressions.

Post-merge production browser QA also completed successfully after the exact Render deployment reached `live`. EN/RU production browser QA, owner-copy/Trading Guide live verification, RU Services form-control QA, and artifact upload all completed successfully.

## Handbook

The homepage Swing current-total contract is documented in:

`docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md`

Handbook update required for PR #208: **YES — completed in the PR**.

## Rollback

To roll back this presentation correction, revert PR #208 / merge commit:

```text
a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c
```

No Trading Lab strategy state, Google Sheet ledger state, broker execution state, Equity History state, or quote-provider rollback is required.
