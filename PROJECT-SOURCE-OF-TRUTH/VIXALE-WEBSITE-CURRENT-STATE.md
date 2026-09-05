# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-04  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. Repository, deployment, and user-visible status are recorded separately and must not be inferred from one another.

At the latest direct GitHub verification on 2026-09-04, the latest website-changing merge on `main` is:

- **Website merge SHA:** `c9f12c84f3a5f07028fc9f963d4369ccf02e9918`
- **Observed commit:** `Merge pull request #50 from ipotrader22-cloud/fix/homepage-hero-production-matcher — Fix homepage hero matcher against production markup`
- **Observed state:** PR #50 merged into `main`

A later documentation-only manifest commit may advance the branch head without changing website behavior. The website merge SHA above is the authoritative code-change reference for PR #50.

### Production / deployment

Direct Render verification on 2026-09-04 found the `tv-telegram-bot` web service configured for `main` with Auto-Deploy enabled. The merge of PR #50 triggered deployment `dep-dadn9ics728c73fd5r90` from commit `c9f12c84f3a5f07028fc9f963d4369ccf02e9918`, and Render reported that deployment as `live`.

- **Production deployment SHA:** `c9f12c84f3a5f07028fc9f963d4369ccf02e9918`
- **Render deployment:** `dep-dadn9ics728c73fd5r90`
- **Deployment status:** LIVE according to Render
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Public homepage hero verification:** **CONFLICT / UNVERIFIED** — after Render reported PR #50 live, a fresh public fetch still returned the prior hero (`Watch the systems live.` with the older three-way CTA set). Do not claim the PR #50 hero is user-visible until a fresh browser/runtime check shows the intended replacement.
- **Public `/pricing` user-visible verification:** UNVERIFIED; exact browser-rendered 7-day page content has not been independently re-confirmed in this pass
- **Live Equity Curve verification:** UNVERIFIED until the authenticated dashboard/runtime is checked

Render `live` status proves the deployment record for the commit, but it does not by itself prove the exact page markup currently observed by a browser. When the runtime and public browser disagree, preserve **CONFLICT / UNVERIFIED** until rechecked.

## Public homepage primary conversion hero

PR #48 introduced the homepage-only presentation refinement intended to make the 7-day read-only access path the dominant hero conversion action. PR #50 corrects the production matcher to operate on the real serialized homepage structure and points the primary CTA at the existing homepage access form anchor.

Repository contract after PR #50:

- homepage route remains `/`
- intended H1: `Watch our trading systems live before you trade them.`
- primary CTA: `Request 7-Day Access` → existing `#password-access` form
- secondary CTA: `Explore Trading Systems` → `/trading-systems`
- existing-user `Dashboard Login` remains available as a smaller tertiary text link
- Telegram Signals is removed from the replacement hero only and remains available elsewhere on the site
- trust line: read-only dashboard, manual approval, individual access code
- responsive desktop/mobile presentation
- matcher identifies the actual serialized `section.wrap.hero` structure and requires stable legacy markers instead of searching only for browser-visible text
- regression fixture mirrors the actual nested `<span>` hero markup and verifies idempotence / non-hero lookalike safety
- no new route, API, Google Sheets request/schema field, environment variable, authentication contract, dashboard data source, trading lifecycle, signal, risk, order, TWS/IBKR, or broker-execution behavior changed

Status:

- **Repository implementation:** MERGED to `main` in PR #50
- **Merge commit:** `c9f12c84f3a5f07028fc9f963d4369ccf02e9918`
- **Render deployment:** LIVE for that commit via `dep-dadn9ics728c73fd5r90`
- **Exact public-browser rendering:** **CONFLICT / UNVERIFIED**; a fresh public fetch after Render reported the PR #50 deployment live still observed the prior hero

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
- **Render deployment:** PR #46 was previously deployed successfully; the service is now on later commit `c9f12c84f3a5f07028fc9f963d4369ccf02e9918`
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

The Equity Graph, 7-Day Access page, and homepage conversion hero are presentation-only and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
