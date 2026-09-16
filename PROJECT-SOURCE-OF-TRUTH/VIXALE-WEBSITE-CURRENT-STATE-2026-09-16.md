# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-16 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #105 — `Fix Swing Equity History accounting parsing and stale-chart visibility`
- **PR #105 merge SHA:** `8671939c333d3b5972b24b3651dcf6c1257cd172`
- **Observed PR state:** MERGED
- **Pre-merge focused verification:** GitHub Actions run `35119819231` — SUCCESS
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-daldfr15efls73bb4r9g`
- **Render deployed SHA:** `8671939c333d3b5972b24b3651dcf6c1257cd172`
- **Render deployment status:** LIVE
- **Fresh public verification:** GitHub Actions run `35131427003` — SUCCESS
- **Canonical Swing page:** `/trading-systems/swing-trading`
- **Swing API:** `/api/swing-leaders`

## PR #105 — Swing Equity History accounting parsing and freshness

PR #105 fixes a website data-parsing/freshness bug in the Swing Model P&L chart without changing Trading Lab automation or trading logic.

The root cause was a legitimate Google Sheets accounting-formatted negative value such as:

```text
($99.95)
```

The strict Swing currency parser previously accepted ordinary signed currency but rejected accounting parentheses. Because the complete nonblank `Equity History` range is validated as one refresh, the 2026-09-15 row caused Equity History refresh failure and the server retained the last valid cached chart while the independently refreshed Public Feed stayed current.

Production behavior after PR #105:

- `FORMATTED_VALUE` remains the Equity History read contract;
- strict currency parsing accepts standard signed currency and accounting negatives including `($99.95)` and `($1,234.56)`;
- malformed currency text remains invalid;
- Public Feed freshness and Equity History freshness are independent;
- a failed Equity History refresh may retain the last valid chart history, but the chart then visibly reports that cached Equity History is stale;
- a successful Equity History refresh clears the stale warning;
- no history is interpolated, reconstructed, or synthesized.

## Fresh production verification

GitHub Actions run `35131427003` fetched the live production API and canonical Swing page after Render reported PR #105 live and verified:

```text
snapshot_date                 2026-09-16
snapshot_time_et              10:02 ET
Public Feed stale             false
Equity History stale          false
Equity History latest date    2026-09-16
2026-09-15 total_model_pnl    1230.46
2026-09-16 total_model_pnl    1539.47
```

The live page also contained the 2026-09-16 snapshot, `10:02 ET`, and the latest displayed Model P&L `1,539.47`, and did not render the Equity History stale warning.

This confirms the 2026-09-15 accounting-formatted negative row no longer causes the later 2026-09-16 history point to disappear.

## Safety boundary

PR #105 does **not** change:

- Swing Score / selection methodology
- Active Portfolio membership logic
- Potential Candidates logic
- target / stop / exit rules
- Trading Lab writer/automation
- Google Sheet schema
- VECO trading logic
- Pine
- bridge
- TWS / IBKR
- Day Trading or Options

The implementation is confined to Swing website data parsing, presentation-safe freshness metadata, UI stale disclosure, tests, and documentation.

## Historical manifest

The prior verified website state remains available at:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-15.md`

For current website state, use this manifest because it records the later PR #105 merge, Render deployment, and live Swing verification.
