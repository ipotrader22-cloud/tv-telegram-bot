# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-24 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing runtime state:

- **Swing Active Portfolio implementation PR:** #201 — `Round Swing quantity display and shorten header` — MERGED
- **Implementation / runtime SHA:** `2e8039690a1e6fff7bb54e5dbffd6e0089dffabf`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-daqldhrbc2fs739elphg`
- **Verified Render deploy commit:** `2e8039690a1e6fff7bb54e5dbffd6e0089dffabf`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36031092837` (run #65)
- **Production QA head SHA:** `2e8039690a1e6fff7bb54e5dbffd6e0089dffabf`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-24-PR199.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit may be newer than the verified runtime implementation commit above without changing website behavior. For operational claims, re-check GitHub `main`, the active Render deploy, and live production QA.

## Swing Active Portfolio table

Canonical public Swing route:

```text
/trading-systems/swing-trading
```

PR #201 changes the Active Portfolio presentation introduced by PR #199:

- the column header `Shares Quantity` is renamed to `Quantity`;
- displayed quantity is rounded to the nearest whole share;
- row-level `P&L, $` remains calculated from the established fixed-$10,000 model-share amount and is not changed by the display rounding.

### Quantity display

The underlying model share amount remains:

```text
model_shares = 10000 / entry_price
```

The public table displays:

```text
Quantity = round(model_shares)
```

This rounding is presentation-only. It does not alter the fixed-$10,000 model accounting or the internal fractional model share amount used for row P&L.

### Open position dollar P&L

The row P&L remains:

```text
open_model_pnl = (current_price - entry_price) * model_shares
```

where `model_shares = 10000 / entry_price` before display rounding.

The existing aggregate `Unrealized Model P&L` display is unchanged.

## Data and strategy boundaries

PR #201 does **not** change:

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

PR #201 changed:

```text
website_swing_active_model_pnl.js
tests/test_swing_active_model_pnl.js
```

## Verification details

```text
GitHub implementation merge:
2e8039690a1e6fff7bb54e5dbffd6e0089dffabf

Render deploy:
dep-daqldhrbc2fs739elphg
status: live
commit: 2e8039690a1e6fff7bb54e5dbffd6e0089dffabf

GitHub Actions:
Production EN/RU Browser QA
run id: 36031092837
run number: 65
status: completed
conclusion: success
head SHA: 2e8039690a1e6fff7bb54e5dbffd6e0089dffabf
```

Both the repository contract job and post-deploy browser QA completed successfully.

## Rollback

To roll back this presentation change, revert PR #201 / merge commit:

```text
2e8039690a1e6fff7bb54e5dbffd6e0089dffabf
```

No Trading Lab strategy state, Google Sheet ledger state, broker execution state, or Equity History rollback is required because PR #201 does not alter those systems.
