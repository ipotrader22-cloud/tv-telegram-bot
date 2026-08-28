# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-08-27  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. It distinguishes repository state, owner-confirmed deployment state, and independently verified runtime behavior.

At the latest direct GitHub verification, the latest website-changing merge on `main` is:

- **Website merge SHA:** `35263700b3907a2bb341f5cba8ad1f49fb6053e4`
- **Observed commit:** `Merge pull request #30 from ipotrader22-cloud/feature/swing-leaders-v1 — Add Vixale Swing Leaders v1 public feed page`
- **Observed state:** PR #30 merged into `main`

A later documentation-only manifest commit may advance the branch head without changing website behavior. The website merge SHA above is the authoritative code-change reference for PR #30.

### Production / deployment

- **Deployment status:** CONFIRMED BY OWNER on 2026-08-27 after PR #30 merge
- **Production deployment SHA:** UNVERIFIED independently
- **Render/runtime configuration:** UNVERIFIED independently
- **Live `/swing-leaders` verification:** UNVERIFIED independently from the assistant runtime
- **Live `/api/swing-leaders` verification:** UNVERIFIED independently from the assistant runtime
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked

The owner's explicit deployment confirmation is authoritative for deployment status. It does not by itself prove the exact deployed SHA or independently verify every public route response.

## Vixale Swing Leaders v1.0

The display/data contract is frozen as **Research/Data Display Freeze: Vixale Swing Leaders v1.0**.

Repository implementation was merged in PR #30.

- **Public page:** `/swing-leaders`
- **Sanitized read-only endpoint:** `/api/swing-leaders`
- **Research source:** `Morning Leader Portfolio — Automated`
- **Spreadsheet ID:** `14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc`
- **Approved worksheet:** `Public Feed`
- **Approved quote source:** `GOOGLEFINANCE` values already resolved in Google Sheets
- **Repository status:** MERGED to `main`
- **Website merge commit:** `35263700b3907a2bb341f5cba8ad1f49fb6053e4`
- **Deployment status:** CONFIRMED BY OWNER on 2026-08-27
- **Exact production deployment SHA:** UNVERIFIED independently

Trading Lab remains the authority for Morning Leader scoring, Ready Now / Close to Breakout / Early Watch classification, portfolio membership, entry/exit values, market posture, research notes, and cash state.

Engineering owns only server-side retrieval, strict public-field sanitization, caching, API transport, stale-state handling, and responsive rendering. The website must not rescore, recalculate returns, infer watch membership, reconstruct missing portfolio state, or generate BUY/SELL decisions.

The public endpoint may expose only the frozen v1.0 whitelist plus a transport-level stale indicator. Shares, dollar cost basis, dollar P&L, cash proceeds by trade, automation metadata, private notes, credentials, and unrelated workbook data must never be returned to browser clients.

On an invalid or unavailable feed refresh, the server retains the last complete validated in-memory snapshot and marks it stale. If no valid snapshot exists, the page/API fail closed with HTTP 503 rather than creating a partial or synthetic portfolio.

Displayed update time comes only from `snapshot_date` and `snapshot_time_et` in the Trading Lab feed. Website fetch time is not substituted for the research snapshot timestamp.

This feature is website/data-display only and remains isolated from TradingView alerts, UAM, Pine strategy behavior, broker routing, TWS/IBKR execution, risk logic, and broker lifecycle behavior.

## Public Trading Systems information architecture

Repository implementation for the public `/trading-systems` page was merged in PR #29 and remains part of the repository baseline used by PR #30.

- **Top-level public categories:** `Day Trading`, `Swing Trading`, and `Market Coverage`
- **Day Trading:** groups `Prime`, `Edge`, and `Straddles`
- **Swing Trading:** one unified multi-session category; do not split the public navigation into Daily and Weekly products
- **Swing presentation contract:** may show multi-session positions, ATR / percentage targets, defined risk, and daily-close target / stop evaluation when those rules are part of the approved strategy specification
- **Swing Leaders link:** the Swing Trading section links to `/swing-leaders`
- **Market Coverage:** retains the existing Stocks / Futures / Options detail sections and deep links
- **PR #29 website merge commit:** `c7165c15015089f36f73e446d1f7e9c14de73823`

This information architecture is website-only. It does not change signal generation, strategy logic, order routing, TWS / IBKR execution, risk-engine behavior, or live data sources.

## Repository baseline relevant to the public dashboard

The checked repository baseline contains the authenticated public dashboard at `/dashboard`, the presentation-only `/dashboard/live-pnl.json` endpoint used for running Open P&L updates, and the merged realized Equity Curve implementation from PR #26. The dashboard reads its displayed operational ledger from Google Sheets. TWS/IBKR execution remains outside the Website / Design / Copy scope.

These statements describe the checked repository baseline. They do not independently prove live runtime state.

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
- **Independent live verification:** UNVERIFIED until the authenticated dashboard/runtime is checked

The merged implementation is presentation-only. It adds no simulated value, trading logic, or execution logic.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, or TWS/IBKR execution behavior unless explicitly requested by the user.

Swing Leaders and the Equity Graph are presentation-only and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
