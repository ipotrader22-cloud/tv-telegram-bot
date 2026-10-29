# SMIO Demo — Verified Paper-Session Baseline (2026-10-29)

**Classification: WORKING PAPER-SESSION BASELINE — bounded acceptance, not a production-money strategy freeze.**

## Release identity

- Repository: `ipotrader22-cloud/tv-telegram-bot`
- Engineering fix: PR #349, commit `2ee345b4770b166ed66d527e921eb60375cb3076`.
- Render service: `srv-d86vh7j7uimc73ao479g`.
- Exact Render deployment: `dep-dbgtr8mi0phs73cs39dg`, status **live** (verified by Render deployment API on 2026-10-29).
- Windows bridge: October 28 engineering handoff reports installed fix and SMIO EOD enabled. This is a separately deployed Windows artifact; **the above Render SHA is not a SHA of the local Windows installation**. The documented local installed source ID is `158aa4cf4e50129afa7d31a3188d284e780e8394`; reverify against live Windows files before a future change.

## October 29 evidence and acceptance

1. Owner enabled existing SMIO TradingView demo alerts, preserving saved strategy parameters.
2. Owner's local HTTP check reported `BRIDGE_RUNNING=True`, `TWS_CONNECTED=True`, `CLIENT_ID=77`, `SMIO_READY=True`, `DEMO_ONLY=True`. This verifies endpoint-reported readiness at that point in time, not persistent connectivity.
3. Render logs show received SMIO setup signals, bridge durable acknowledgments, published OPEN rows, and Telegram success for sampled entries including NOW and INTC. Durable ACK alone explicitly reported `broker_execution=false`, so ACK is not fill proof.
4. Render logs around 15:55 ET show EOD_CLOSE callback processing and published CLOSED rows; sampled events included QCOM and other symbols. Sampled Telegram publication succeeded. Full per-execution/receipt-to-ledger audit remains separate.
5. Owner supplied an end-of-day TWS screenshot with total stock position 0 and zero position shown on the displayed symbol rows (14 symbols). Owner independently confirmed **Orders empty for today's SMIO positions**, including no residual SMIO GTC targets.
6. This constitutes **PASS for the observed October 29 demo-account broker-flat / no-SMIO-working-orders EOD end-state**, backed by owner-supplied broker UI evidence and callback publication observations. Not proof of all historical fills, every alert's lifecycle, or strategy profitability.

## Known boundaries — do not overstate

- Paper/simulated trading ONLY. No live-money approval or Trading Lab research freeze.
- Alert activation count per profile was not independently read back from TradingView; owner reported activation.
- A position=0 screen and no working orders show the terminal state, not the exact fill path for every symbol.
- EOD callback publication does not prove each broker execution without matched TWS executions/order IDs.
- Sampled Render Sheets/Telegram success does not prove universal Telegram/Sheets delivery.
- An earlier October 26 CLOSE/EOD failure and October 27 manually closed positions were separately reconciled in `docs/SMIO_MANUAL_RECONCILIATION_2026-10-28.md`. Preserve that audit evidence; no stale signal replay or journal reset.
- Historical ambiguous state must never be wiped or bypassed to activate a symbol. Apply existing broker/account/ownership, duplicate prevention, and conflict checks.
- **Canonical engineering reference** for this bounded paper result is this file. The authoritative live system state must still be reverified when making future CURRENT/ACTIVE/DEPLOYED claims.

## Preservation / future changes

- Freeze this *engineering reference baseline*: PR #349 behavior, untouched Pine parameters, signal transport and execution safety guards. Do not casually modify broker/EOD/strategy behavior based on this passing session.
- Any subsequent engineering changes must compare to this baseline, run full scoped regression, and document deviations and tested results.
- Retain existing Windows installer/backups/journal/outbox and broker execution evidence; this GitHub record does not copy local private or account-identifying files.
- Continue natural-signal end-to-end paper monitoring. If anomalies recur, mark acceptance for that affected case FAIL/UNVERIFIED and investigate without retroactively rewriting this historical observation.
