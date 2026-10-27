# SMIO authorized autonomous paper acceptance

Updated October 26, 2026, after the owner said: "I give you the approval to do whatever is necessary to complete this fix." This supersedes the earlier owner-presence requirement and NKE selection. The owner need not remain in the chat. Broker evidence, the experimental contract, unchanged strategy settings/sizing and preservation of disputed history remain required.

## Installed repair and scheduled continuation

Windows source `158aa4cf4e50129afa7d31a3188d284e780e8394` is installed and health verified. PR #349 remains draft pending paper acceptance. Private backups and deployment details are in `smio-windows-rollout.md`. All 51 SMIO alerts and effective/autostart SMIO EOD remain off at this checkpoint.

Active Codex heartbeat: `smio-paper-acceptance`, in this chat every ten minutes during weekday hours 09:00–16:50 local time. Its prompt limits routine work to 09:20–16:20 America/New_York, with necessary reconciliation allowed afterward. First intended preflight: October 27 at 09:20 ET, subject to fresh broker-confirmed session and runtime availability. Keep the machine on, Codex running, TWS/bridge connected and authenticated TradingView available. The heartbeat does not replace the bridge EOD scheduler.

## Selected existing profile

- Exact private-config attested TWS Simulated Trading account.
- Alert `SMIO_RSI_DEMO_NOW_15`: NOW, 15 minutes, ATR target mode.
- Experimental contract `SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013`.
- Configuration `PINE01:114:5:10:4:true:true:8:21:200:ATR:2.8:Auto:true`.
- Existing UAM snapshot matches symbol/timeframe/config and records verified properties. Reverify actual inputs and Strategy Properties before use.
- Preserve existing TradingView sizing and exact positive whole-share payload quantity. No synthetic order, invented signal, one-share override, parameter change or historical replay.

The only NOW journal row was CLOSED. Independent read-only broker evidence at 23:43:17 ET on October 26 showed the exact account matched, NOW flat and no NOW all-client working order. Recheck before activation. NKE is ineligible because its old OWNERSHIP_LOST row still reserves the symbol. Do not clear disputed history to make a test pass.

## Preflight and activation

1. Read current repo rules/handbook. Compare installed hashes with the deployment record. Verify exact demo account, connected healthy bridge, advancing maintenance, clean NOW reservation/position/all-client order checks, receipt health and broker liquidHours for the current date.
2. Verify a safe shared-bridge maintenance slot and fresh process ancestry. Privately back up current startup/state. Stop only the verified bridge/reloader tree, change the single autostart EOD injection from 0 to 1, and restart hidden through the existing entrypoint with EOD 1 and unrelated configuration intact. Do not rerun the old deployment script with obsolete PIDs/hashes.
3. Verify installed hashes, effective child environment, exact account and maintenance/session diagnostics after restart. If a gate fails, keep the alert paused and diagnose it. No speculative broker order or stale replay.
4. Resume only the exact NOW alert after inspecting its stored profile. Keep the other 50 SMIO alerts paused and unrelated alerts untouched. Save screenshot proof and timestamped redacted preflight evidence.

EOD is five minutes before the broker-confirmed actual close, including half days. Unknown/holiday schedules fail closed. Do not force an out-of-session test.

## Acceptance evidence

1. Wait for a fresh natural TradingView entry. Capture exact event/setup IDs, durable receipt, handler start, broker entry/target IDs and actual executions.
2. Capture legitimate CLOSE handling and an EOD case with owned residual shares at the five-minute boundary. Verify terminal target cancellation, post-cancel ownership/quantity proof, one owned close order and executions covering remaining shares. Offline tests cover injected disconnect/cancel races; do not disrupt shared systems to force them.
3. Independently confirm NOW flat and no residual owned order through all-client queries. Compare foreign orders with baseline without canceling them or misattributing their independent changes.
4. Reconcile executions into the journal and execution-first Render callback/ledger. HTTP 200, submission or dashboard status alone cannot pass. Outbox delay must not suppress residual recovery.
5. Verify duplicate suppression using receipt/order evidence. Do not replay an old entry as a shortcut. A deliberately injected duplicate requires a concrete completed-test-event check proving no new order can result.

No entry is inconclusive. A target/legitimate close before EOD leaves EOD execution unproven; continue this limited profile in another permitted session after fresh preflight. Do not broaden profiles, alter parameters or fabricate evidence.

## Failure handling and completion

On ambiguous ownership, account/session mismatch, unexpected order or residual quantity, preserve evidence and prevent new entries while preserving necessary owned-position recovery. Pausing an alert suppresses CLOSE signals too: account for this before pausing an open test profile. Never submit a speculative extra close, cancel foreign orders, rewrite history or restore stale state over fills. Diagnose and repair engineering failures within scope, then revalidate.

After all evidence passes, pause the test alert once flat, record acceptance, reconcile draft #336 overlap and complete eligible PR #349 merge and exact production verification under repository rules. Do not blindly merge overlapping PRs or enable all profiles. Disable this heartbeat after completion. Stay quiet for unchanged checks; report meaningful progress, failure, completion or essential owner action.
