# Vixale Swing Leaders v1.0 — Engineering Acceptance Verification

Frozen contract: **Research/Data Display Freeze: Vixale Swing Leaders v1.0**  
Verification date: 2026-08-27  
Scope: website/data display only

## Acceptance coverage

1. Active tickers are read directly from `Public Feed`; no website membership logic exists.
2. Scores and statuses are read directly from the feed and only presentation casing is applied to the READY NOW badge.
3. Entry prices are preserved as supplied strings; they are not recalculated.
4. Current prices are read only from the approved `Public Feed` values and require `quote_source=GOOGLEFINANCE`.
5. Return percentages are preserved as supplied strings; they are not recalculated.
6. The public parser uses a strict whitelist and does not serialize Shares, dollar cost basis, market value, dollar P&L, cash proceeds, automation fields, or unrelated columns.
7. Watchlist membership is read directly from the feed and accepts only the frozen `CLOSE TO BREAKOUT` / `EARLY WATCH` classifications.
8. A ticker present in both Active Positions and Closed Trades invalidates the new snapshot instead of publishing conflicting state.
9. Market Posture is rendered from the supplied feed text without website reinterpretation.
10. Last Updated uses `snapshot_date` and `snapshot_time_et`; website fetch time is not substituted.
11. Invalid/unavailable refreshes retain the complete last valid in-memory snapshot and mark it stale; if no valid snapshot exists, the page/API return HTTP 503 and do not synthesize partial state.
12. Google Sheets access remains server-side through the existing service-account client; browser responses contain only the public whitelist plus the transport `stale` flag.
13. The page contains responsive mobile table/card rules at the 900px and 720px breakpoints.
14. The delayed-quote and research/model-portfolio disclosures are visibly rendered.

## Checks run on the feature branch

- `node --check app.js`
- `node tests/test_swing_leaders.js`
- `node tests/test_swing_leaders_app_integration.js`
- `node tests/test_trading_systems_hierarchy.js`
- `git diff --check`

All checks passed before the integration commit was created.

## Deployment boundary

No Render configuration, Google credentials, Pine code, bridge code, UAM routing, TWS/IBKR execution, strategy logic, or production deployment is changed by this branch. Runtime access by the existing Render Google service account to the approved research workbook must be verified after an authorized merge/deployment; failure is fail-closed (503 or stale last-valid snapshot), never reconstructed research state.
