# Vixale Swing Leaders — Display Contract v1.1

**Freeze:** Vixale Swing Leaders v1.1  
**Approved:** 2026-08-27  
**Risk/exit rule clarification approved:** 2026-09-03  
**Trading/research owner:** Trading Lab  
**Engineering owner:** VIXALE Engineering / Codex  
**Scope:** public display and server-side data integration only

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

Engineering may read, validate, whitelist, cache, format, render, and calculate the explicitly approved fixed-allocation Model P&L. Engineering must not independently score, select candidates, create entries/exits, infer exit reasons, change portfolio membership, substitute quotes, or alter Trading Lab strategy logic.

This implementation remains isolated from Pine, TradingView alerts, UAM, TWS/IBKR execution, bridge order/risk logic, and broker lifecycle behavior.
