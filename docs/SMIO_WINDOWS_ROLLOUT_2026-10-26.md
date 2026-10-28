# SMIO Windows repair installation — October 26, 2026

The owner explicitly approved the prepared controlled Windows rollout and agreed
to supervise the existing NKE 60-minute demo profile in the next broker-confirmed
session. This authorizes the controlled stop/restart, SMIO alert isolation and
EOD-off pre-test hold. It does not certify a research freeze or authorize arbitrary
orders, changed sizing, historical replay or foreign-order cancellation.

Installed source: `158aa4cf4e50129afa7d31a3188d284e780e8394`, PR #349, at approximately
**22:04 ET**. Five files: `ib_bridge_core.py`, `smio_demo_adapter.py`,
`smio_eod_policy.py`, `smio_ingress.py`, `smio_execution_audit.py`. The core overlay
inserts only the reviewed SMIO receipt hook into the installed local source,
preserving its customization. Candidate and baseline hashes were checked before
replacement; installed hashes were checked afterward.

Only the verified bridge Python/reloader tree was stopped. TWS, ngrok and other
services stayed running. Private backups of code, startup, config and existing
lifecycle/outbox/managed state are under
`C:\ib_bridge\backups\smio-repair-20261026-220427`. No `.env` was copied or changed.
No journal/outbox was manually rewritten, cleared, restored or replayed.

The same entrypoint `C:\ib_bridge\.venv\Scripts\python.exe -u ib_bridge.py` was
restarted hidden with stdout/stderr under `C:\ib_bridge\logs`. Autostart's EOD
injection changed from `1` to `0` for the approved hold. Independent process-memory
readback confirmed effective EOD `0`, RTH America/New_York, 09:30–16:00.

Verified runtime:

- TWS Simulated Trading, exact private-config account matched, connected true.
- Shared dry-run false, unchanged; demo ready true; maintenance task running.
- Ingress/reconcile/EOD timestamps advance; EOD reports disabled; durable ingress
  present with no received test signals.
- NKE session diagnostic verifies stock liquidHours, including October 27
  09:30–16:00. Recheck at the actual test rather than relying on this cached result.
- Independent all-client query at **22:06:39 ET**: NKE/OXY flat; external SBUX +100;
  five external orders (SBUX and four ES BAG); no open SMIO order. External-order
  scope matches predeployment. No order/cancellation was submitted by the rollout.
- TradingView search `SMIO_RSI_DEMO_` returned 51 alerts. The authorized Pause as
  per filter action completed; visible rows read Stopped manually. The other 42
  alerts were outside the filter and were not selected.

The repair is installed, but the incident is **not acceptance-complete**. NKE's
original first failure and the missed original failsafe still lack retrospective
trace evidence. Broker-confirmed paper execution remains untested.

All 51 SMIO demo alerts and the SMIO EOD flag remain off at this checkpoint.
The owner's subsequent approval to do whatever is necessary to finish supersedes
the chat-presence requirement. The amended [paper run](SMIO_CONTROLLED_PAPER_ACCEPTANCE.md)
uses the existing NOW 15-minute profile because NKE's historical OWNERSHIP_LOST
reservation must remain intact. A same-chat heartbeat is active for next-session
preflight and controlled single-profile activation. Preserve current Strategy
Properties sizing and require a fresh legitimate signal; its absence is
inconclusive, not permission to fabricate one.

PR #349 remains draft/unmerged pending paper acceptance. Windows runs the explicitly
approved candidate; Render/main were not changed. Later documentation-only commits
do not imply another install. Draft #336 must not be blindly merged over the
overlapping adapter/policy files.

Before install, 73 SMIO and 115 adjacent Python tests passed, as did scoped JS
regressions and both GitHub bridge/stale-entry workflows at the installed SHA.
Runtime checks supplement those tests; they do not replace paper execution proof.
Rollback requires a controlled stop and backed-up code restoration, followed by
broker reconciliation. Preserve new lifecycle/receipt/outbox evidence; never
restore older state over fills or replay quarantined work.
