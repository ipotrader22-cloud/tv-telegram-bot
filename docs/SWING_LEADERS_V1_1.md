# Vixale Swing Leaders — Display Contract v1.1

**Freeze:** Vixale Swing Leaders v1.1  
**Approved:** 2026-08-27  
**Risk/exit rule clarification approved:** 2026-09-03  
**Daily Model P&L equity curve approved:** 2026-09-03  
**Canonical public-route consolidation approved:** 2026-09-05  
**Trading/research owner:** Trading Lab  
**Engineering owner:** VIXALE Engineering / Codex  
**Scope:** public display and server-side data integration only

## Canonical public route

The canonical public Swing Trading page is:

`/trading-systems/swing-trading`

It reuses the existing Swing Leaders read-only page handler and the same server-side data service. The former public page `/swing-leaders` is a legacy compatibility URL and must return a permanent `301` redirect to `/trading-systems/swing-trading` rather than render a second copy of the portfolio.

The sanitized read-only JSON endpoint remains `/api/swing-leaders` for backward compatibility. No new Swing API, workbook, tab, field, refresh job, scoring path, or Trading Lab writer is introduced by the route consolidation.

The canonical page continues to read the same Trading Lab-owned `Public Feed` and `Equity History` data through the existing service/cache path. Morning Trading Lab updates and newly appended Equity History rows therefore continue to appear without a website deploy. Engineering must not add a website-side writer, recalculate portfolio membership, or interfere with the automation that populates those worksheets.

## Public categories

The public page uses exactly three research/model-portfolio categories:

- **Active Portfolio** — open model positions currently monitored for target, scheduled morning-review stop, and ongoing Trading Lab qualification.
- **Potential Candidates** — potential candidates under active research review. They are not confirmed entries and may never enter the portfolio.
- **Closed Trades** — completed model positions with final return and Trading Lab-supplied exit reason.

The former public `Ready Now`, `Close to Breakout`, `Early Watch`, and `Interns` labels are not part of the public presentation.

The Trading Lab `Public Feed` may continue to use the internal `INTERNS` section name and Engineering may continue to use `intern_count` / `interns` internally. Those internal names must not be rendered as public-facing website labels.

## Potential Candidates presentation

Potential Candidates are rendered as a compact row/table section, visually aligned with Active Portfolio.

Desktop columns:

- `Ticker`
- `Score`
- `Why We’re Watching`
- `Reviewed`

Engineering renders the Trading Lab `brief_reason` text directly and must not rewrite, summarize, infer, or hide the reason. The reason receives the widest desktop column and may wrap when needed. Mobile may responsively stack the same four fields while preserving the complete reason and review date.

## Model methodology

Each model position uses a fixed **$10,000 allocation at entry**.

- Profit target: **+10% from entry** and may trigger **intraday**. If price touches or crosses the +10% target while the model position is open, Trading Lab closes the model trade at exactly the +10% target price.
- Stop loss: **not intraday**. It is evaluated only during the scheduled **morning review**. If the current price at that review is more than **5% below entry**, Trading Lab closes the model position at the current review price. An intraday move below -5% at any other time does not trigger the stop by itself.
- The Swing Leaders stop must not be described as an EOD or daily-close rule.
- Research exit: Trading Lab may remove a position from the Active Portfolio independently of the price stop/target.

Engineering displays these rules but does not execute, evaluate, or infer exits. The website must not independently compare prices with target/stop thresholds or change portfolio membership.

## Approved public Risk & Exit Rules copy

> **Risk & Exit Rules:** Each model position starts with a $10,000 allocation. The profit target is +10% from entry and may trigger intraday. Stop-losses are evaluated only during the scheduled morning review; if the current review price is more than 5% below entry, the position is closed at that price. A position may also be closed when Trading Lab removes it from the Active Portfolio. **Research Score:** proprietary Vixale research metric shown on a 0–100 scale.

The public website must not use the superseded descriptions `daily closing price is more than 5% below entry`, `intraday -5% stop`, or `EOD stop` for Swing Leaders.

## Model P&L

The website may calculate presentation-only dollar Model P&L from the frozen $10,000 allocation and Trading Lab-supplied return percentages:

`Position Model P&L = $10,000 × Return %`

- **Active Portfolio / Unrealized Model P&L:** sum across active rows using the delayed `GOOGLEFINANCE`-based returns in the feed.
- **Closed Trades / Realized Model P&L:** sum across displayed closed rows using final Trading Lab return values.

No compounding, broker shares, broker P&L, user sizing, or quote-source substitution is permitted.

## Daily Model P&L equity curve

The Swing Leaders hero includes one compact **Model P&L** line chart. On desktop the chart appears to the right of the Swing Leaders hero information. On smaller screens it moves below the hero summary. The chart contains one line, a visible `$0` baseline, date/time context, and point tooltips with `Date` and `Model P&L`.

The authoritative history source is the same workbook, worksheet **`Equity History`**, with these Trading Lab-owned columns:

- `snapshot_date`
- `snapshot_time_et`
- `realized_model_pnl`
- `unrealized_model_pnl`
- `total_model_pnl`
- `model_equity`
- `active_count`

The chart uses **only `total_model_pnl` from immutable Trading Lab Equity History rows**. Engineering must not recalculate historical points from Active Portfolio rows, current prices, model allocations, or any other present-day state.

For the public chart/API, Engineering exposes only:

- `snapshot_date`
- `snapshot_time_et`
- `total_model_pnl`

The Trading Lab inception row is explicitly identified by `snapshot_time_et = INCEPTION`. The approved sheet currently represents the inception P&L fields with `-`; Engineering may normalize **only that explicit `INCEPTION` row** to `total_model_pnl = 0` for rendering the required Trading Lab `$0` starting point. A `-` in a normal history row is not a zero and is invalid.

History behavior is strict:

- read the full `Equity History` column range so newly appended Trading Lab rows are discovered without a deployment;
- validate nonblank rows against the approved column contract;
- sort valid snapshots chronologically, with the explicit inception point first;
- never interpolate missing dates;
- never synthesize replacement dates or P&L values;
- never overwrite or recompute earlier points because current market prices changed;
- reject duplicate date/time snapshot identities;
- the history must begin at the explicit Trading Lab `$0` inception row.

The existing Swing Leaders server-side Google Sheets refresh/cache path owns the read. A normal refresh retrieves the latest appended history row automatically, so **daily Trading Lab Sheet updates require no website deploy**. If an `Equity History` refresh fails after a valid history has been cached, Engineering keeps serving the last valid cached history and logs the refresh failure; it does not clear or fabricate the chart. A Public Feed failure retains the existing whole-snapshot stale-cache behavior.

No Google credentials, workbook access, private history columns, or raw worksheet data are exposed to browser code.

## Feed contract

Authoritative workbook: `Morning Leader Portfolio — Automated`  
Spreadsheet ID: `14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc`  
Tab: `Public Feed`

Snapshot fields:

- `snapshot_date`
- `snapshot_time_et`
- `market_posture`
- `active_count`
- `intern_count`
- `cash_pct`
- `quote_source` (`GOOGLEFINANCE`)
- `quote_delay_notice`
- `research_disclaimer`

### ACTIVE PORTFOLIO

- `ticker`
- `exchange`
- `score`
- `entry_date`
- `entry_price`
- `current_price`
- `return_pct`
- `last_review_date`
- `brief_note`

### INTERNS (internal feed name; public UI label: Potential Candidates)

- `ticker`
- `score`
- `brief_reason`
- `review_date`

### CLOSED TRADES

- `ticker`
- `entry_date`
- `entry_price`
- `exit_date`
- `exit_price`
- `return_pct`
- `last_score`
- `exit_reason`

Approved public exit reasons:

- `TARGET`
- `STOP LOSS`
- `DROPPED FROM ACTIVE PORTFOLIO`

## Research score wording

Public explanation is limited to:

> Proprietary Vixale research metric shown on a 0–100 scale.

No scoring methodology is exposed or inferred by Engineering.

## Engineering boundary

Engineering may read, validate, whitelist, cache, format, render, and calculate the explicitly approved fixed-allocation Model P&L. Engineering must not independently score, select candidates, create entries/exits, infer exit reasons, change portfolio membership, substitute quotes, alter historical Trading Lab equity rows, alter Trading Lab strategy logic, or modify the morning automation that fills the Swing worksheets.

This implementation remains isolated from Pine, TradingView alerts, UAM, TWS/IBKR execution, bridge order/risk logic, broker lifecycle behavior, and the owner-managed Option Journal workflow.
