# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-08-27  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. It is not sufficient by itself to prove production deployment.

At the latest direct GitHub verification, the latest website-changing merge on `main` is:

- **Website merge SHA:** `c7165c15015089f36f73e446d1f7e9c14de73823`
- **Observed commit:** `Merge pull request #29 from ipotrader22-cloud/feature/website-swing-trading — Add Swing Trading hierarchy to Trading Systems`
- **Observed state:** PR #29 merged into `main`

A later documentation-only manifest commit may advance the branch head without changing website behavior. The website merge SHA above is the authoritative code-change reference for PR #29.

The observed repository state is **not** a claim that this SHA is deployed to production.

### Production / deployment

- **Production deployment SHA:** UNVERIFIED
- **Deployment status:** UNVERIFIED
- **Render/runtime configuration:** UNVERIFIED from this manifest
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked
- **Live Trading Systems hierarchy verification:** UNVERIFIED until the public runtime is checked

Before stating that the Equity Curve, Trading Systems hierarchy, or any other website change is deployed or active, verify the deployment provider/runtime and the live site when accessible.

## Public Trading Systems information architecture

Repository implementation for the public `/trading-systems` page was merged in PR #29.

- **Top-level public categories:** `Day Trading`, `Swing Trading`, and `Market Coverage`
- **Day Trading:** groups `Prime`, `Edge`, and `Straddles`
- **Swing Trading:** one unified multi-session category; do not split the public navigation into Daily and Weekly products
- **Swing presentation contract:** may show multi-session positions, ATR / percentage targets, defined risk, and daily-close target / stop evaluation when those rules are part of the approved strategy specification
- **Market Coverage:** retains the existing Stocks / Futures / Options detail sections and deep links
- **Repository status:** MERGED to `main` in PR #29
- **Website merge commit:** `c7165c15015089f36f73e446d1f7e9c14de73823`
- **Production deployment:** UNVERIFIED / do not claim deployed

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
- **Production deployment:** UNVERIFIED / do not claim deployed

The merged implementation is presentation-only. It adds no new Google Sheets request, API route, payload/schema field, environment variable, simulated value, trading logic, or execution logic.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, or TWS/IBKR execution behavior unless explicitly requested by the user.

The Equity Graph is presentation-only and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
