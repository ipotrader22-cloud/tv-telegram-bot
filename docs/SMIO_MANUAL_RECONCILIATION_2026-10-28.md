# Verified manual-close reconciliation

Handbook update required: YES.

The owner confirmed manual TWS closes of the October 26 NKE 2,801, SBUX 956,
and OXY 1,657 LONG positions and cancellation of their GTC targets. Broker-flat
alone was not used as historical evidence. Independent read-only TWS captures
matched the configured simulated account, contract identities, every recorded
entry execution and full manual SELL execution quantities. Archived completed
orders identified the exact target references as Cancelled by Trader. Fresh
all-client queries before and after maintenance found no incident working order.

| Symbol | Quantity | Entry VWAP | Exit VWAP | Last fill, New York | Gross realized P&L |
| --- | ---: | ---: | ---: | --- | ---: |
| NKE | 2801 | 37.82 | 37.87856122813281 | 2026-10-26 19:51:34 | 164.03 |
| SBUX | 956 | 103.01 | 102.41206066945607 | 2026-10-27 04:00:00 | -571.63 |
| OXY | 1657 | 64.10645745322873 | 63.776487628243814 | 2026-10-26 20:05:43 | -546.76 |

P&L excludes commissions. Owner report dates are not substituted for fill times.
Exact execution IDs, contract IDs, cancellation records and reconciliation IDs
are retained in the private evidence package and journal, not this public report.

## Cause and publication trace

At repair time the three rows were OWNERSHIP_LOST, rather than still
TARGET_CANCEL_PENDING. The adapter binds fills to exact account/order ID/ref;
manual client-0, blank-ref executions fail that automatic ownership check.
The subsequent restart also invalidated continuous execution-history coverage.
Those conservative checks correctly prevented a speculative extra SELL but
provided no automatic historical publication path. The Render Webhook Inbox had
the original TradingView CLOSE_POSITION receipts marked COMPLETE; that is not
proof of broker execution. No matching broker exit payload existed in the local
Render callback outbox. No synthetic callback was generated or marked delivered.

## Evidence-only repair procedure

`bridge/smio_manual_reconciliation.py` is an offline operator library. It is not
imported by the live trading adapter and never connects to a broker, submits an
order, cancels an order or sends a callback. `plan_manual_close` requires exact
owner authorization, full matching entry and manual-exit evidence, one verified
contract, no competing history, current flat/order checks and exact terminal
target cancellation. Partial closes, unavailable execution history and flat-only
observations fail closed. Reconciliation identity is stable across recaptures.

1. Back up source ledger cells and the evidence; verify exact setup IDs and no
   existing CLOSED record. Keep strategy alerts paused.
2. In one Sheets batch, append the three factual Manual Close rows, corresponding
   Trades audit rows and Trade Metadata with actual execution IDs; clear only
   the three matching Open Positions rows. Pending contained no matching rows.
   Leave unrelated history, formulas and schema intact. Label raw provenance
   IBKR_EXECUTION_AUDIT / OWNER_AUTHORIZED_LEDGER_RECONCILIATION. Do not claim
   Telegram or callback delivery.
3. Read back the exact values, one CLOSED row and zero OPEN/Pending rows per
   setup. Only then may `finalize_manual_close` return terminal journal rows.
4. Freshly verify bridge process identity, account, hashes and safe maintenance
   conditions. Stop the reloader before its worker, back up the journal/config/
   outbox, apply only the three verified rows and restart with unchanged effective
   configuration. Retain original entry/target identities and historical evidence.
5. Verify broker flat/no incident orders again, maintenance health, terminal
   journal persistence and the authenticated website. Do not replay old signals.

Completed journal maintenance October 28 around 07:19 ET. Private backup:
`C:\ib_bridge\backups\smio-manual-reconcile-20261028-071920`.
EOD remains enabled. Other setup order/fill/publication identities and runtime
configuration were preserved. Two unrelated ES BAG orders were untouched.
Dashboard inspection confirmed zero OPEN/working rows and all three accurate
Manual Close records. There were no broker mutations during this repair.

Rollback requires a fresh stopped-bridge maintenance audit. Do not restore stale
journals or delete execution-backed CLOSED history after subsequent activity.
Use the private before-images for an explicitly reviewed correction, preserving
new evidence and unrelated work.

## Validation and remaining gate

Eight added regressions cover full and partial manual closes, missing history,
flat-only evidence, canceled/still-working targets, wrong account/contract,
conflicting execution IDs, repeated repair/restart, duplicate/stale ledger rows,
and a delayed CLOSE through the real adapter before and after restart without
another order. All 81 SMIO tests pass. CI discovers the new suite automatically.

This resolves the three historical publication/journal records. It does not
prove the separate natural-signal CLOSE/EOD acceptance required by #335.
PR #349 remains draft until that gate is satisfied. All SMIO alerts remain paused;
only the existing NOW 15-minute profile may resume after fresh permitted-session
preflight under the previously approved plan. NKE is not substituted for NOW.
