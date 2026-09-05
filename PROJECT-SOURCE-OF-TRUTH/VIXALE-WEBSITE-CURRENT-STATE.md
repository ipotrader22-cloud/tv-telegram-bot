# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-04  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. Repository, deployment, and user-visible status are recorded separately and must not be inferred from one another.

At the latest direct GitHub verification on 2026-09-04, the latest website-changing merge on `main` is:

- **Website merge SHA:** `0c9a6860d1631c489831219d8d5a1c90880ceee6`
- **Observed commit:** `Merge pull request #46 from ipotrader22-cloud/feature/seven-day-free-access-page — Replace 7 Days Free placeholder with access page`
- **Observed state:** PR #46 merged into `main`

A later documentation-only manifest commit may advance the branch head without changing website behavior. The website merge SHA above is the authoritative code-change reference for PR #46.

### Production / deployment

Direct Render verification on 2026-09-04 found the `tv-telegram-bot` web service configured for `main` with Auto-Deploy enabled. The merge of PR #46 triggered deployment `dep-dadmnfp5efls739alsl0` from commit `0c9a6860d1631c489831219d8d5a1c90880ceee6`, and Render reported that deployment as `live`.

- **Production deployment SHA:** `0c9a6860d1631c489831219d8d5a1c90880ceee6`
- **Render deployment:** `dep-dadmnfp5efls739alsl0`
- **Deployment status:** LIVE according to Render
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Public `/pricing` user-visible verification:** UNVERIFIED; direct public-page retrieval was not available during this verification pass
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked

Do not treat Render `live` status alone as proof of exact browser-rendered page content when the public route has not also been checked.

## Public 7-Day Access page

PR #46 replaces the prior `/pricing` `Coming Soon` placeholder with a focused 7-day read-only dashboard access page.

Repository contract:

- route remains `/pricing`
- navigation label remains `7 Days Free`
- primary page message: `Watch Vixale free for 7 days.`
- primary CTA returns to the existing homepage dashboard-access form at `/#access`
- secondary CTA links to `/trading-systems`
- copy describes read-only access to active trade ideas, open trades, closed trades, and tracked results
- access requests remain manually reviewed
- approved viewers receive an individual dashboard code by email
- no API, Google Sheets schema, environment variable, authentication, trading lifecycle, signal, risk, order, or broker-execution contract changed

Status:

- **Repository implementation:** MERGED to `main` in PR #46
- **Merge commit:** `0c9a6860d1631c489831219d8d5a1c90880ceee6`
- **Render deployment:** LIVE for that commit
- **Exact public-browser rendering:** UNVERIFIED during this pass

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

These statements describe the checked repository baseline. They do not independently prove every dashboard feature is user-visible in the currently deployed runtime.

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
- **Live authenticated dashboard verification:** UNVERIFIED during this pass

The merged implementation is presentation-only. It adds no new Google Sheets request, API route, payload/schema field, environment variable, simulated value, trading logic, or execution logic.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, or TWS/IBKR execution behavior unless explicitly requested by the user.

The Equity Graph and the 7-Day Access page are presentation-only and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
