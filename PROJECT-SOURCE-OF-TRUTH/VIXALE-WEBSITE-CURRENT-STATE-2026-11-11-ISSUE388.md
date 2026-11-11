# VIXALE Website — Production State, November 11, 2026 (Issue #388)

## Verified deployment and source boundary

Owner explicitly authorized production intraday Swing valuation. PR #393 merged
to `main` as `c2b8faebcb051d617fe424cf1303d124e1e415eb`. Render production
service `tv-telegram-bot`, ID `srv-d86vh7j7uimc73ao479g`, automatically
deployed that exact SHA as `dep-dbqbdo0473hc73cookeg`. Render reported LIVE,
finished 2026-11-11T18:42:11Z, and logs show successful `npm start` and
"Server running on port 10000". Plan remains starter. The source configuration
`VIXALE_SWING_SOURCE=ENGINE2` was previously activated and is not changed
by PR #393. The staging observer and trading cron were not redeployed by
this production PR.

The previous manifest, `VIXALE-WEBSITE-CURRENT-STATE-2026-11-08-ENGINE2.md`,
records the independently validated November 8 activation and legacy rollback.
It remains historical evidence, not the latest application deployment.

## Implementation

Read-only production website projection `lib/swing-intraday-valuation.js`
decorates authenticated Engine 2 Swing API and HTML. The separate immutable
morning Public Feed remains the authoritative source for ticker membership,
entry price, nine-factor score, and 10:00 ET decisions. Intraday valuation
reads the existing `Engine 2 Quotes` Google Finance grid and validates
spreadsheet/sheet ID, formula, symbol, positive price/volume, source-time ET,
provider delay and NYSE session. Missing/stale quotes can use an explicitly
identified *completed* Google Chart 1-minute close; never an uncompleted/future
candle. Quoting, P&L and status are independent of writer/ledger history.
Fixed $10K normalized per-position P&L is retained; incomplete fresh coverage
returns null aggregate, never an invented $0. The existing authenticated
page updates every 60 seconds and must clear stale/unavailable price/P&L.
The LEGACY source path remains isolated.

Changed files: `.github/workflows/swing-source-rollout.yml`,
`docs/VECO_DEVELOPER_HANDBOOK.md`, `lib/swing-intraday-valuation.js`,
`lib/swing-leaders-core.js`, `lib/swing-leaders.js`,
`tests/test_issue388_production_intraday.js`,
`tests/test_swing_active_model_pnl.js`, and
`website_swing_active_model_pnl.js`. No `app.js`, broker, TWS, TradingView,
Google Sheet writer, Telegram, strategy, risk or scoring change.

## Verified checks

- GitHub PR #393 head `0011ac5ddda98fa968ad9a8eeef2bf9cfa1de78a`.
- Swing Source Rollout run `43080038329`: SUCCESS, including strict quote
  formulas, timestamp validation, missing/stale/fallback, $10K arithmetic,
  authenticated Engine2/LEGACY full-startup tests and existing UI regressions.
- Production EN/RU Browser QA run `43080038437`: SUCCESS (isolated CI tests).
- Render exact production SHA `c2b8faebcb051d617fe424cf1303d124e1e415eb`:
  LIVE on deployment `dep-dbqbdo0473hc73cookeg`.
- Authenticated browser tab inspected after deploy still held the previously
  loaded pre-deployment document showing frozen November 11 morning marks;
  it was not refreshed/navigated with the read-only Chat browser tool.
  Such a historical tab is **not** validation of the new live build.

## Unverified / acceptance boundary

The connected Chat Browser in this session permits reading tab context but
not reloading or navigating the signed-in session. No authenticated new
production page/API request was confirmed after the deployment, and a query
for `SWING_INTRADAY_VALUATION` production Render logs returned no
valuation observations in the checked interval. Therefore **production
post-deployment customer page/API valuation and the exact live AIZ/EXR/PSA/VTRS
quote timestamps/P&L are UNVERIFIED**. The independently verified staging
source timestamps and P&L recorded in Issue #388 and staging PR #392 must
not be represented as the production runtime readback.

To complete that final independent proof, refresh the signed-in Swing page
on each EN/RU host, compare its page with `/api/swing-leaders` under the
same authenticated session, read the `SWING_INTRADAY_VALUATION` Render
observation, and require all active tickers to have fresh verified source
times, correct P&L or explicit stale/unavailable statuses. Keep acceptance
open if any fails.

## Rollback and data safety

Revert the PR #393 application changes in a narrow PR, deploy normally from
main and verify the exact Render SHA; no workbook or ledger rewrite. Emergency
source rollback can select `VIXALE_SWING_SOURCE=LEGACY` using the
previously tested deployment path, but the older legacy records must be
labelled with their true historical review date. No production strategy,
broker execution, secrets, environment-variable values or paid Render plan
was changed in Issue #388.

Documentation-only merges after the exact Render app deploy may make the
GitHub `main` SHA differ from the deployed code SHA by a commit containing
`[skip render]`. In that case, the code tree and actual Render deployment,
not the main SHA alone, determine runtime application state.
