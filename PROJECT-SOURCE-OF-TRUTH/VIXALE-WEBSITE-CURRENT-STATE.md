# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-08-24  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. It is not sufficient by itself to prove production deployment.

At the latest direct GitHub verification, `main` pointed to:

- **Observed main SHA:** `f1b38746b17f17bc9ae0ed5f30bc10d65ca107ab`
- **Observed commit:** `Add realized P&L equity curve to Vixale dashboard (#26)`
- **Observed state:** PR #26 merged into `main`

The observed SHA is a repository/code-state fact. It is **not** a claim that this SHA is deployed to production.

### Production / deployment

- **Production deployment SHA:** UNVERIFIED
- **Deployment status:** UNVERIFIED
- **Render/runtime configuration:** UNVERIFIED from this manifest
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked

Before stating that the Equity Curve or any other website change is deployed or active, verify the deployment provider/runtime and the live site when accessible.

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
