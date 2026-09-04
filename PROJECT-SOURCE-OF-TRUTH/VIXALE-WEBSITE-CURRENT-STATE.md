# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-03  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records the website/dashboard repository baseline and approved presentation contract. It is not sufficient by itself to prove production deployment.

At the latest direct GitHub verification, the latest website-changing merge on `main` is:

- **Website merge SHA:** `a2c0393892a70dbfa63ee60830f0aae1c88e4e94`
- **Observed commit:** `Merge pull request #40 from ipotrader22-cloud/feature/swing-leaders-potential-candidates-ui — Rename Swing Leaders Interns to Potential Candidates`
- **Observed state:** PR #40 merged into `main`

A later documentation-only manifest commit may advance the branch head without changing website behavior. The website merge SHA above is the authoritative code-change reference for PR #40.

### Production / deployment

- **Swing Leaders PR #40 deployment status:** CONFIRMED BY OWNER on 2026-09-03 (America/New_York)
- **Production deployment SHA:** UNVERIFIED independently from Render
- **Render/runtime configuration:** UNVERIFIED from this manifest
- **Independent live `/swing-leaders` fetch:** UNVERIFIED from the current tooling environment
- **Repository `main`:** directly verified at `a2c0393892a70dbfa63ee60830f0aae1c88e4e94`

The owner confirmation establishes that deployment was performed. Do not infer the exact Render deploy SHA or claim independent live-route verification until those are checked from the runtime/provider or live page.

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

## Vixale Swing Leaders public page

The public Swing Leaders display is website/data-integration only and remains isolated from TradingView, UAM, TWS/IBKR, bridge order handling, execution, and strategy logic.

### Repository implementation

- **Route:** `/swing-leaders`
- **Read-only JSON:** `/api/swing-leaders`
- **Display contract:** Vixale Swing Leaders v1.1
- **Latest public UI update:** PR #40
- **Merge commit:** `a2c0393892a70dbfa63ee60830f0aae1c88e4e94`
- **Deployment:** CONFIRMED BY OWNER on 2026-09-03; exact Render deploy SHA remains UNVERIFIED

### Public categories

The public UI uses:

- **Active Portfolio** — open model positions
- **Potential Candidates** — potential candidates under active research review
- **Closed Trades** — completed model positions with Trading Lab-supplied exit reason

The term **Interns** is internal/feed terminology only and must not appear as a public-facing website label.

Potential Candidates use the existing Trading Lab feed fields:

- `ticker`
- `score`
- `brief_reason`
- `review_date`

Desktop presentation is a compact row/table layout with columns:

`Ticker | Score | Why We’re Watching | Reviewed`

The website renders `brief_reason` directly and does not rewrite, summarize, infer, or generate research reasons.

### Model display rules

- fixed model allocation: **$10,000 per position**
- profit target: **+10% from entry**
- stop-loss rule: evaluated on the **daily closing price**; stop event if the daily close is more than **5% below entry**
- Trading Lab may also remove a position from the Active Portfolio through research disqualification
- `GOOGLEFINANCE` remains the approved quote source in the Trading Lab feed; quotes may be delayed
- Active Portfolio header may show **Unrealized Model P&L**
- Closed Trades header may show **Realized Model P&L**

Engineering may calculate only the approved presentation value:

`Model P&L = $10,000 × Trading Lab-supplied return %`

Engineering must not infer entries, exits, exit reasons, candidate membership, Active Portfolio membership, scoring, or quote substitutions.

### Feed boundary

Internal `Public Feed` compatibility remains unchanged. The feed may continue to use:

- `INTERNS`
- `intern_count`
- `interns`

These names are implementation details and are not rendered publicly.

The server keeps the strict field whitelist, validates the full snapshot, uses the existing server-side Google Sheets client, and retains the last complete valid snapshot when refresh fails. With no prior valid snapshot, the page/API fail closed rather than constructing partial data.

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

## Documentation conflict

`docs/SWING_LEADERS_V1_1.md` and merged Swing Leaders code reflect the v1.1 public display contract and **Potential Candidates** naming. The older Swing Leaders subsection in `docs/VECO_DEVELOPER_HANDBOOK.md` still contains v1.0 terminology. Until that subsection is safely updated, treat the handbook wording there as a documented conflict rather than as the authoritative Swing Leaders public-label contract.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, or TWS/IBKR execution behavior unless explicitly requested by the user.

The Equity Graph and Swing Leaders public display are presentation-only and must remain independent of trading/execution logic.

## Update procedure

When website state changes:

1. Re-check `main` and record the relevant merge SHA.
2. Re-check deployment/runtime state.
3. Re-check live user-visible behavior when accessible.
4. Update this manifest.
5. If evidence conflicts, write **CONFLICT / UNVERIFIED** rather than choosing a source by filename/date alone.
