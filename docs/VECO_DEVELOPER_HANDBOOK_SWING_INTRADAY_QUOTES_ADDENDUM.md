# VECO Developer Handbook — Swing Intraday Quote Refresh Addendum

Date: 2026-09-25  
Updated: 2026-09-26  
Scope: public Swing Trading quote-refresh presentation only

## Purpose

This addendum records the browser refresh contract for the canonical public Swing Trading page:

`/trading-systems/swing-trading`

The goal is to keep the already-public Active Portfolio valuation visibly current during the day without changing the Trading Lab feed, quote provider, portfolio membership, or strategy behavior.

## Source and refresh contract

The browser must reuse the existing sanitized endpoint:

`/api/swing-leaders`

That endpoint continues to read the Trading Lab-owned `Public Feed` through the existing Swing service/cache path. The validated feed contract requires `quote_source = GOOGLEFINANCE`; the browser must not scrape Google Finance, call a new quote provider, or substitute TWS/IBKR data.

The page may poll the existing endpoint once per minute while visible. The Swing service retains its existing five-minute Google Sheets cache, so browser polling does not change the authoritative Sheet read cadence or introduce a second quote pipeline. Quotes remain subject to the existing delayed-quote disclosure.

## Safe update boundary

Intraday refresh is display-only. Before applying a refreshed snapshot, the browser must verify that the currently rendered Active Portfolio and the API snapshot have the same ticker set and matching entry prices. If membership or an entry instance differs, the browser leaves the rendered table unchanged rather than combining values from different portfolio snapshots.

When the displayed portfolio identity matches the API snapshot, the browser may update only:

- `Current` from the API `current_price`;
- `Return` from the API `return_pct`;
- row-level `P&L, $` using the established fixed-$10,000 model allocation and the refreshed current price;
- the existing aggregate `Unrealized Model P&L` from the API `active_unrealized_model_pnl`;
- the current `Total Model P&L` summary as `closed_realized_model_pnl + active_unrealized_model_pnl` from the same sanitized API snapshot.

`Quantity` remains derived from the fixed `$10,000 / entry_price` model methodology. The refresh layer must not add/remove rows, change scores, change research notes, infer targets/stops, or change portfolio membership.

Hidden browser tabs should not continue periodic polling. When a tab becomes visible again, the page may request an immediate refresh.

## Current total versus Equity History

The current summary and the historical curve have different time semantics and must not be presented as if they were the same value:

- `Total Model P&L` is the current display summary: current `Unrealized Model P&L` plus `Realized Model P&L` from the sanitized Public Feed snapshot.
- the `Equity History` line and its plotted points remain sourced only from immutable Trading Lab `Equity History.total_model_pnl` rows.
- intraday quote refresh may change the current `Total Model P&L` summary without changing the last historical point.
- Engineering must never rewrite, synthesize, append, or recalculate an Equity History point from current browser/API values.

This distinction prevents a stale historical snapshot value from being mistaken for the current portfolio total while preserving the frozen Trading Lab historical record.

## Homepage Swing preview

The homepage Swing Trading preview at `/` must use the same current-total semantics as the canonical Swing page:

- it reuses `/api/swing-leaders`;
- `Open positions` comes from `active_count`;
- `Potential candidates` comes from `intern_count`;
- `Total model P&L` is calculated only as `active_unrealized_model_pnl + closed_realized_model_pnl` from the current sanitized API response;
- it must not use the latest `equity_history.total_model_pnl` point as the current homepage total.

The homepage preview remains an on-demand product preview and does not add independent interval polling. This keeps its existing lightweight behavior while preventing an immutable historical snapshot from being displayed as the current Swing total.

## EN / RU behavior

The English and Russian public pages share the same final HTML/data wiring. The intraday refresh script must therefore remain locale-neutral and use structural selectors/data attributes rather than translated visible labels. Russian localization must preserve the script and row metadata unchanged.

## Trading-system boundary

This refresh behavior does **not** change:

- Trading Lab scoring, stock selection, or Active Portfolio membership;
- entry/exit, +10% target, scheduled-morning stop, or rating-dropout logic;
- the Public Feed schema or writer automation;
- the `GOOGLEFINANCE` quote source;
- Equity History rows or calculations;
- broker/TWS/IBKR execution;
- VECO/Pine/UAM/Telegram trading behavior.

## Verification

Regression coverage should confirm that:

- the client refresh script is injected only on the canonical Swing page;
- it polls `/api/swing-leaders` at the documented cadence;
- it updates Current, Return, row P&L, aggregate Unrealized Model P&L, and current Total Model P&L;
- current Total Model P&L equals the API snapshot's `active_unrealized_model_pnl + closed_realized_model_pnl`;
- the Equity History line/points remain independent from that intraday current summary;
- the homepage Swing preview also uses `active_unrealized_model_pnl + closed_realized_model_pnl` for its Total model P&L and does not use `equity_history` for that current summary;
- it refuses to mix values when the displayed portfolio ticker set or entry prices no longer match the API snapshot;
- hidden tabs do not poll continuously;
- the same refresh wiring survives Russian localization;
- unrelated Swing sections/tables are not modified;
- the refinement remains idempotent.

## Rollback

Rollback is presentation-only: revert the Swing intraday quote-refresh/homepage-preview refinement and its tests/docs. No Trading Lab, Google Sheet, quote-source, broker, Equity History, or strategy rollback is required.