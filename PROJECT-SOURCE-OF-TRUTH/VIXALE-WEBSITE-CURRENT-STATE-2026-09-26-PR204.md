# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-26 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing runtime state:

- **Swing intraday quote refresh PR:** #204 — `Refresh Swing GoogleFinance quotes throughout the day` — MERGED
- **Implementation / runtime SHA:** `1f5eeea4d2003e8a0040c31fa207d25b04b605e4`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-darqiq0u01pc73edqe4g`
- **Verified Render deploy commit:** `1f5eeea4d2003e8a0040c31fa207d25b04b605e4`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36238276119` (run #68)
- **Production QA head SHA:** `1f5eeea4d2003e8a0040c31fa207d25b04b605e4`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-24-PR199.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For operational claims, still re-check GitHub `main`, the active Render deploy, and live production QA.

## Swing intraday quote refresh

Canonical public Swing route:

```text
/trading-systems/swing-trading
```

PR #204 adds a browser refresh layer to the existing Active Portfolio display so an already-open page can show updated portfolio valuation during the day without a manual page reload.

The browser reuses the existing sanitized endpoint:

```text
/api/swing-leaders
```

The browser polls that endpoint once per minute while the page is visible. Hidden tabs do not continue normal periodic polling; when the tab becomes visible again, the page may refresh immediately.

The authoritative Swing service / Google Sheets cache cadence remains unchanged at five minutes. No new quote provider or second quote pipeline was introduced. The existing Trading Lab Public Feed remains authoritative, with the validated `quote_source = GOOGLEFINANCE` contract.

When the displayed portfolio identity matches the refreshed API snapshot, the browser updates only:

- `Current`;
- `Return`;
- row-level `P&L, $` using the existing fixed `$10,000` model allocation;
- aggregate `Unrealized Model P&L`.

`Quantity` remains derived from the established fixed `$10,000 / entry_price` methodology and is not changed by the refresh layer.

Before applying refreshed values, the client verifies that the displayed Active Portfolio has the same ticker set and matching entry prices as the API snapshot. If portfolio membership or entry identity differs, the page leaves the current rendered table unchanged rather than combining values from different snapshots.

## Data and strategy boundaries

PR #204 does **not** change:

- Trading Lab scoring or stock selection;
- Active Portfolio membership;
- entry or exit rules;
- +10% target logic;
- scheduled-morning -5% stop logic;
- rating-dropout logic;
- fixed-$10K model-accounting methodology;
- Public Feed writer/schema;
- Equity History calculations;
- Google Sheets writer cadence;
- broker/TWS/IBKR execution;
- VECO/Pine/UAM behavior;
- Telegram lifecycle;
- quote provider.

This is a website display-refresh change only.

## Implementation files

PR #204 changed:

```text
.github/workflows/production-locale-browser-qa.yml
docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md
tests/test_swing_active_model_pnl.js
website_swing_active_model_pnl.js
```

## Verification details

Implementation merge:

```text
GitHub main commit:
1f5eeea4d2003e8a0040c31fa207d25b04b605e4

Render deploy:
dep-darqiq0u01pc73edqe4g
status: live
commit: 1f5eeea4d2003e8a0040c31fa207d25b04b605e4

GitHub Actions:
Production EN/RU Browser QA
run id: 36238276119
run number: 68
status: completed
conclusion: success
head SHA: 1f5eeea4d2003e8a0040c31fa207d25b04b605e4
```

The pre-merge locale-contract job on PR #204 also passed, including syntax checks, the focused Swing intraday quote-refresh regression, owner-copy/PDF regressions, Services RU parity, and existing Russian localization regressions.

The post-merge production browser QA completed successfully after the exact Render deployment reached `live`. EN/RU production browser QA, owner-copy/Trading Guide live verification, RU Services form-control QA, and artifact upload all completed successfully.

## Handbook

The refresh/data-source safety contract is documented in:

`docs/VECO_DEVELOPER_HANDBOOK_SWING_INTRADAY_QUOTES_ADDENDUM.md`

Handbook update required for PR #204: **YES — completed in the PR**.

## Rollback

To roll back the Swing intraday quote refresh, revert PR #204 / merge commit:

```text
1f5eeea4d2003e8a0040c31fa207d25b04b605e4
```

No Trading Lab strategy state, Google Sheet ledger state, broker execution state, Equity History state, or quote-provider rollback is required because PR #204 does not alter those systems.
