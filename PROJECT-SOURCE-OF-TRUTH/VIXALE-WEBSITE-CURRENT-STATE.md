# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-08-27 ET  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. It is not sufficient by itself to prove production deployment.

At the latest direct GitHub verification, the latest website-changing merge on `main` is:

- **Website merge SHA:** `253e1d8d68acd04c5eaeb6e46b04f295c6a7f418`
- **Observed commit:** `Merge pull request #32 from ipotrader22-cloud/feature/swing-leaders-v1-1 — Update Vixale Swing Leaders display to v1.1`
- **Observed state:** PR #32 merged into `main` on 2026-08-27 ET / 2026-08-28 UTC
- **Previous Swing Leaders merge:** PR #30 / `35263700b3907a2bb341f5cba8ad1f49fb6053e4`

The observed repository state is **not** by itself a claim that PR #32 is deployed to production.

### Production / deployment

- **Production deployment SHA:** UNVERIFIED
- **Swing Leaders v1.0 deployment:** CONFIRMED BY OWNER on 2026-08-27; the owner subsequently confirmed the page rendered after the Google service account received Viewer access to the approved workbook
- **Swing Leaders v1.1 deployment:** UNVERIFIED after PR #32 merge
- **Render/runtime configuration:** UNVERIFIED from this manifest
- **Live Swing Leaders v1.1 verification:** UNVERIFIED until `/swing-leaders` and `/api/swing-leaders` are checked after deployment
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked
- **Live Trading Systems hierarchy verification:** UNVERIFIED until the public runtime is checked

Before stating that PR #32 or the v1.1 page is deployed or active, verify the deployment provider/runtime and the live site when accessible.

## Public Swing Leaders — v1.1 repository contract

Repository implementation for Vixale Swing Leaders v1.1 was merged in PR #32.

- **Public page:** `/swing-leaders`
- **Read-only JSON endpoint:** `/api/swing-leaders`
- **Approved workbook:** `Morning Leader Portfolio — Automated`
- **Approved worksheet:** `Public Feed`
- **Approved quote source:** `GOOGLEFINANCE`; quotes may be delayed and must not be represented as broker execution prices
- **Public categories:** `Active Portfolio`, `Interns`, `Closed Trades`
- **Active Portfolio:** open model positions supplied by Trading Lab
- **Interns:** potential candidates under active research review; they are not confirmed entries
- **Closed Trades:** completed model positions with Trading Lab-supplied exit reasons
- **Approved exit reasons:** `TARGET`, `STOP LOSS`, `DROPPED FROM ACTIVE PORTFOLIO`
- **Model allocation:** fixed `$10,000` per model position at entry for public Model P&L presentation
- **Active Unrealized Model P&L:** sum of `$10,000 × supplied active return %`
- **Closed Realized Model P&L:** sum of `$10,000 × supplied closed return %`
- **Public risk copy:** profit target `+10%` from entry; stop-loss event is based on a daily closing price more than `5%` below entry; a position may also be removed by Trading Lab research disqualification
- **Research Score wording:** proprietary Vixale research metric shown on a 0–100 scale; scoring methodology is not publicly explained

Engineering remains display/integration only. It must not independently score, select, enter, exit, reclassify, or substitute a quote source. In particular, a displayed delayed quote below the public stop threshold does not authorize the website to remove a position; Trading Lab remains authoritative for portfolio membership and published exit state.

The backend reads the approved `Public Feed` through existing server-side Google Sheets authentication, enforces a public whitelist, and never returns Google credentials or private workbook fields to the browser. Failed/invalid refreshes retain the last complete validated snapshot and mark it stale; cold-start failure returns HTTP 503 rather than constructing partial or simulated portfolio data. Displayed Last Updated comes from the feed snapshot timestamp, not website fetch time.

### Documentation status / conflict

- `docs/SWING_LEADERS_V1_1.md` contains the frozen v1.1 Engineering/Trading Lab display contract and is merged on `main` in PR #32.
- `docs/VECO_DEVELOPER_HANDBOOK.md` still contains the older Swing Leaders v1.0 subsection.
- Therefore the handbook Swing Leaders subsection is **STALE / CONFLICTING DOCUMENTATION** relative to the v1.1 contract and live repository implementation.
- Until the handbook is safely amended, use `docs/SWING_LEADERS_V1_1.md` plus the merged v1.1 implementation for the Swing Leaders v1.1 contract. Do not treat the old handbook v1.0 wording as current Swing Leaders behavior.

This documentation conflict does not imply a trading-engine conflict; PR #32 changes the isolated website/display module and tests only. Pine, UAM, TWS/IBKR, bridge execution, signal generation, and broker risk logic are unchanged.

## Public Trading Systems information architecture

Repository implementation for the public `/trading-systems` page was merged in PR #29.

- **Top-level public categories:** `Day Trading`, `Swing Trading`, and `Market Coverage`
- **Day Trading:** groups `Prime`, `Edge`, and `Straddles`
- **Swing Trading:** one unified multi-session category; do not split the public navigation into Daily and Weekly products
- **Swing presentation contract:** may show multi-session positions, ATR / percentage targets, defined risk, and daily-close target / stop evaluation when those rules are part of the approved strategy specification
- **Market Coverage:** retains the existing Stocks / Futures / Options detail sections and deep links
- **Repository status:** MERGED to `main` in PR #29
- **Website merge commit:** `c7165c15015089f36f73e446d1f7e9c14de73823`

This information-architecture change is website-only. It does not change signal generation, strategy logic, order routing, TWS / IBKR execution, risk-engine behavior, or live data sources.

## Repository baseline relevant to the public dashboard

The checked repository baseline contains the authenticated public dashboard at `/dashboard`, the presentation-only `/dashboard/live-pnl.json` endpoint used for running Open P&L updates, and the merged realized Equity Curve implementation from PR #26. The dashboard reads its displayed operational ledger from Google Sheets. TWS/IBKR execution remains outside the Website / Design / Copy scope.

These statements describe the checked repository baseline. They do not independently prove live deployment state.

## Approved primary Equity Graph contract

The primary stock-system performance graph is defined as **Equity Curve — Realized P&L**.

### Data source

Use the existing `Closed Trades` worksheet data already read for the dashboard. The graph calculation intentionally uses only:

- **Column C — `close_time`**
- **Column I — `result`**

No symbol filtering, asset-class lookup, Trade Metadata classification, open-position data, or unrealized/Open P&L is part of the equity calculation.

### Calculation

For every valid closed-trade row:

1. Read the calendar date from `close_time`.
2. Read realized P&L from `result`.
3. Sum all realized P&L values that close on the same calendar date.
4. Sort dates ascending.
5. Calculate the running cumulative total:

`Cumulative Realized P&L today = prior cumulative total + Daily Realized P&L`

Blank/invalid realized values are omitted; simulated replacement values must never be introduced.

### Presentation

The chart contract is:

- X-axis: close date
- Y-axis: Cumulative Realized P&L ($)
- explicit horizontal `$0` reference line
- tooltip: `Date / Daily P&L / Cumulative P&L`
- latest cumulative value displayed as **Total Realized P&L**
- clean responsive line chart for desktop and mobile
- no Open/unrealized P&L in the curve
- no artificial movement on days without a closed trade

### Implementation/deployment status

- **Design/data contract:** APPROVED by user
- **Repository implementation:** MERGED to `main` in PR #26
- **Merge commit:** `f1b38746b17f17bc9ae0ed5f30bc10d65ca107ab`
- **Production deployment:** UNVERIFIED / do not claim deployed from this manifest alone

The merged implementation is presentation-only. It adds no new Google Sheets request, API route, payload/schema field, environment variable, simulated value, trading logic, or execution logic.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, or TWS/IBKR execution behavior unless explicitly requested by the user.

Swing Leaders v1.1 and the Equity Graph are presentation/data-integration features and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
