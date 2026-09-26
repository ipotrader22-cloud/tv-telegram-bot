# VECO Developer Handbook — Swing Intraday Quote Refresh Addendum

Date: 2026-09-25  
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
- the existing aggregate `Unrealized Model P&L` from the API `active_unrealized_model_pnl`.

`Quantity` remains derived from the fixed `$10,000 / entry_price` model methodology. The refresh layer must not add/remove rows, change scores, change research notes, infer targets/stops, or change portfolio membership.

Hidden browser tabs should not continue periodic polling. When a tab becomes visible again, the page may request an immediate refresh.

## EN / RU behavior

The English and Russian public pages share the same final HTML/data wiring. The intraday refresh script must therefore remain locale-neutral and use structural selectors/data attributes rather than translated visible labels. Russian localization must preserve the script and row metadata unchanged.

## Trading-system boundary

This refresh behavior does **not** change:

- Trading Lab scoring, stock selection, or Active Portfolio membership;
- entry/exit, +10% target, scheduled-morning stop, or rating-dropout logic;
- the Public Feed schema or writer automation;
- the `GOOGLEFINANCE` quote source;
- Equity History;
- broker/TWS/IBKR execution;
- VECO/Pine/UAM/Telegram trading behavior.

## Verification

Regression coverage should confirm that:

- the client refresh script is injected only on the canonical Swing page;
- it polls `/api/swing-leaders` at the documented cadence;
- it updates Current, Return, row P&L, and aggregate Unrealized Model P&L;
- it refuses to mix values when the displayed portfolio ticker set or entry prices no longer match the API snapshot;
- hidden tabs do not poll continuously;
- the same refresh wiring survives Russian localization;
- unrelated Swing sections/tables are not modified;
- the refinement remains idempotent.

## Rollback

Rollback is presentation-only: revert the Swing intraday quote-refresh refinement and its tests/docs. No Trading Lab, Google Sheet, quote-source, broker, Equity History, or strategy rollback is required.
