# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-24 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing runtime state:

- **Swing Active Portfolio implementation PR:** #199 — `Add shares and dollar P&L to Swing Active Portfolio` — MERGED
- **Implementation / runtime SHA:** `243e3f86c4117d76dc948117c64fde0142b45ddc`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-daqkv66q1p3s73akop10`
- **Verified Render deploy commit:** `243e3f86c4117d76dc948117c64fde0142b45ddc`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36027578324` (run #64)
- **Production QA head SHA:** `243e3f86c4117d76dc948117c64fde0142b45ddc`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-23-PR197.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For operational claims, still re-check GitHub `main`, the active Render deploy, and live production QA.

## Swing Active Portfolio table

Canonical public Swing route:

```text
/trading-systems/swing-trading
```

PR #199 adds two presentation columns between `Current` and `Return` in the Active Portfolio table:

```text
Shares Quantity
P&L, $
```

These are **public model-position display values**, not brokerage shares or broker-account P&L.

### Model-share calculation

The public Swing model continues to use the established fixed `$10,000` allocation per Active position.

Displayed model shares are derived as:

```text
model_shares = 10000 / entry_price
```

Shares are displayed to four decimal places.

### Open position dollar P&L

For each Active row:

```text
open_model_pnl = (current_price - entry_price) * model_shares
```

The row P&L is formatted to cents and uses the existing positive/negative styling.

The implementation deliberately derives these values from the already-public sanitized Entry/Current prices plus the established fixed model allocation. It does **not** publish the legacy/internal Shares or Cost Basis fields from the research workbook.

The existing aggregate `Unrealized Model P&L` display remains unchanged by PR #199; this change adds row-level explanatory values only.

## Data and strategy boundaries

PR #199 does **not** change:

- Trading Lab scoring or stock selection;
- Active Portfolio membership;
- entry or exit rules;
- +10% target logic;
- scheduled-morning -5% stop logic;
- rating-dropout logic;
- fixed-$10K model-accounting methodology;
- Public Feed/API field whitelist;
- Equity History calculations;
- Google Sheets schemas or automation writes;
- broker/TWS/IBKR execution;
- VECO trading logic.

This is a website presentation change only.

## Implementation files

PR #199 changed:

```text
website_swing_active_model_pnl.js
package.json
tests/test_swing_active_model_pnl.js
```

The new refinement is loaded by `package.json` and transforms only the server-rendered Swing Active Portfolio table on the canonical Swing page. Other tables remain unchanged.

## Verification details

Implementation merge:

```text
GitHub main commit:
243e3f86c4117d76dc948117c64fde0142b45ddc

Render deploy:
dep-daqkv66q1p3s73akop10
status: live
commit: 243e3f86c4117d76dc948117c64fde0142b45ddc

GitHub Actions:
Production EN/RU Browser QA
run id: 36027578324
run number: 64
status: completed
conclusion: success
head SHA: 243e3f86c4117d76dc948117c64fde0142b45ddc
```

The locale-contract job passed, including repository syntax/regression checks covered by the workflow, and the post-deploy browser QA job completed successfully against production.

A focused local unit test for the new refinement also passed before merge. It verifies column insertion, four-decimal model-share display, dollar P&L calculation, gain/loss styling, idempotence, and that unrelated tables are not modified.

The generic external web crawler returned a stale pre-change Swing snapshot during verification and was not treated as the authoritative production-verification source. The exact Render deployment plus post-deploy production browser QA are the authoritative runtime checks recorded here.

## Rollback

To roll back this Swing table presentation change, revert PR #199 / merge commit:

```text
243e3f86c4117d76dc948117c64fde0142b45ddc
```

No Trading Lab strategy state, Google Sheet ledger state, broker execution state, or Equity History rollback is required because PR #199 does not alter those systems.
