# VIXALE Website — November 11, 2026 — Refresh and last-session valuation

## Verified application identity

Application PR #407 merged as `4a1935b334621f5d8bedb0408ab2460f990d3b3e`.
Production Render service `srv-d86vh7j7uimc73ao479g` automatically deployed
that exact SHA as `dep-dbqgds9srm7s738gvqp0`, **LIVE** at
`2026-11-12T00:24:12.331109Z` (November 11, 19:24 ET).
Subsequent documentation-only commits use `[skip render]` and do not establish
a different live application SHA.

## Observed signed-in production behavior

Fresh reload of `https://www.vixale.com/trading-systems/swing-trading` and
authenticated `/api/swing-leaders` independently agree after deployment:

| Ticker | Exact valuation price | Displayed model P&L |
| --- | ---: | ---: |
| AIZ | 323.26 | +$38.51 |
| EXR | 159.455 | +$32.40 |
| PSA | 335.375 | +$9.70 |
| VTRS | 21.085 | +$127.28 |

All four marks are `GOOGLE_FINANCE_CHART_1M` completed minute-bar closes,
timestamped **2026-11-11 16:00:00 ET**. API coverage is **4/4**, aggregate
unrealized model P&L **+$207.89**, `valuation_market_open=false`,
`valuation_session_date=2026-11-11`, status `LAST_SESSION_VALUATION`.
The page visibly labels the market closed and the last regular-session
valuation date/time. Prices displayed to two decimals retain full precision
for the unchanged $10,000-per-position calculation.

The browser's successful API refresh marker advanced without page reload
from `2026-11-12T00:24:38.946Z` to `2026-11-12T00:25:38.614Z`.
No new application JavaScript errors appeared after the post-deploy reload;
a pre-deploy SyntaxError remained in historical browser logs and a separate
third-party extension warning is unrelated. Desktop visual inspection showed
all four price/P&L rows and the aggregate. Server valuation logs independently
recorded the same four marks and total at `00:24:35.986Z`.

## Preserved contracts

The morning decision remains **2026-11-11 10:01 ET**, with four active holdings,
five candidates and 59.6% cash. Original `current_price`/morning reference marks
remain frozen; quote projection is read-only. No spreadsheet/formula/Q/R edits,
new trades, research/ranking/universe changes or historical ledger rewrites.
Original realized P&L remains **-$1,011.37**. Authenticated API retains all seven
original equity rows and a separate verified reporting history with the
November 11 10:01 ET point at **$0**. That historical chart point is not the
current open-position valuation. The signed-in page also visibly showed the
reporting date and $0 inception point, resolving the earlier manifest's
signed-in reporting-inception acceptance limitation.

## Validation and boundaries

Final PR head `95a39c94572712863de3d6146b2233e90ced48af` passed Swing Source
Rollout run `43126543397` and EN/RU locale-contract run `43126543419`.
The PR browser job is intentionally skipped; authenticated production evidence
above was collected directly after exact-SHA deployment. Full local Swing
checks include 15 valuation regressions, two emitted-script execution tests,
and ENGINE2/LEGACY full-preload owner/viewer EN/RU HTTP checks that compile all
inline scripts. Cold starts, overnight/weekend/holiday/early close/DST,
partial provider failures, cache retention at the closing bell and expiry at
next open are covered. Future market sessions remain unobserved; calendar
fixtures are not evidence that tomorrow's actual market pipeline succeeded.

Off-hours marks must belong to the last completed session and be near its close;
arbitrary stale or after-hours quotes are rejected. Missing coverage still
withholds aggregate P&L. These are indicative regular-session marks, not official
closing-auction or live after-hours prices. Intraday freshness resumes at open.
The separate Engine 2 research/observer deployment was not changed.

Rollback: revert application PR #407 and allow normal production deployment.
No source-data rollback is required. Previous reporting-inception and news
manifests remain historical evidence.
