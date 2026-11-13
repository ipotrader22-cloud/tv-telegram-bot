# SMIO stalled-close recovery — November 12, 2026

Handbook update required: YES.

## Incident evidence and scope

The owner requested a repair of partial-close recovery and missed EOD flattening.
The private incident journal and read-only broker checks established an unresolved
CLOSE_PENDING setup with two retired closes and a remaining position. Execution
history coverage was valid. The last order's cancellation/rejection reason was
unavailable; do not attribute that cancellation without exact broker evidence.
Private journal contents, account/order identifiers and actual trade sizes are
intentionally omitted from this public implementation document.

The old implementation counted all earlier close fills in its partial-order
cancellation condition. It could therefore cancel an unfilled replacement.
It also silently exhausted two replacements, while the EOD scanner excluded
every setup already holding a close intent/order. This made a terminal stalled
close ineligible for the EOD rescue. Google Sheets publication failures cannot
explain the remaining broker position.

## Decision and implementation

Only `bridge/smio_demo_adapter.py` changes runtime behavior:

- A current order's own fills and first-partial-observation timestamp govern
  its partial-fill grace period. Historical fills still count for remaining
  quantity and final execution accounting, never for canceling its successor.
- Do not cancel a working final partial order when no replacement budget is
  available. Do not replace a working, missing, or ambiguously submitted order.
- Ordinary recovery retains two replacements. The enabled, IB-confirmed EOD
  window can reserve two additional replacements, at most five submissions
  total including the initial close. This budget is setup-scoped and persists
  in `retired_closes`; repeated scans, new signals and restart cannot reset it.
  A failed final attempt remains blocked for operator review, not an infinite
  order loop and not a guarantee of execution.
- EOD includes OPEN, TARGET_CANCEL_PENDING, CLOSE_SUBMITTING and CLOSE_PENDING
  setups. An existing intent is reconciled under both existing locks, with a
  fresh journal and broker refresh. It is never overwritten by a competing EOD
  intent. Original RSI_STOP/RSI_PROFIT attribution is preserved.
- Only an exact Cancelled/ApiCancelled/Inactive order permits retirement.
  Each subsequent close passes the original account, dry-run, coverage,
  ownership, all-client order, exact target, current position and IB session
  proofs. All target and retired-close fills are recalculated after awaits.
  The final no-await RTH boundary guard remains in place.
- Additional reserved replacements remain EOD-window-gated even after a crash
  between retiring an old order and submitting a new one. No after-hours order,
  ambiguous-history adoption, foreign holding flatten, synthetic CLOSE callback
  or stale event replay is introduced.
- Terminal exhaustion and missing order evidence now leave explicit journal
  blockers. `/ib/smio-demo-status` adds `close_recovery_version=20261112.1` and
  account-free unresolved-close summaries. An unresolved EOD recovery reports
  blocked rather than being silently skipped as a successful evaluation.

Pine, signals, quantities requested by TradingView, stop/target prices, the
15:55/half-day policy, Prime/Edge/SMI execution, Render, Telegram and Sheets
contracts are unchanged. Journal additions are optional and backward compatible:
per-order `partial_seen_at`, `terminal_status`, `retired_at`; existing diagnostic
fields retain their meaning. The uploaded journal is private evidence and must
not be copied into the repository or edited to manufacture recovery.

## Verification

`tests/test_smio_stalled_close_eod.py` exercises real adapter control flow with
offline broker fixtures, using representative 10/3/2/5 quantities. It covers
order-local grace, the final working partial order, EOD-only budget persistence,
duplicate/concurrent passes, lost acknowledgement before/after fill, restart,
missing exact orders, coverage failure, foreign executions/orders, account and
dry-run gates, full/partial late fills, wrong remaining quantity, failed writes,
session expiration, holidays/half-days and a publication outage. No test imports
the live core or connects to TWS. The new tests fail against the pre-repair
adapter; existing lifecycle/isolation tests must also pass.

```text
python -B -m unittest discover -s tests -p 'test_smio*.py'
python -B -m unittest tests.test_vixale_edge_bridge_isolation tests.test_smi_forward_bridge_isolation tests.test_bridge_quote_reconnect_adapter tests.test_shrek_eod_watchdog
```

## Windows rollout — not performed by a GitHub/Render deployment

This repair was prepared from a Linux workspace. It can inspect the existing
bridge GET diagnostics, but cannot read/write C:\ib_bridge or control its
Windows processes. Installed-source comparison, restart and paper acceptance
remain explicit local deployment steps. A version marker proves which adapter
is loaded; it does not by itself prove a completed broker trade.

Local Windows operator/agent procedure (owner has requested this repair):

1. Fetch the merged repair into a clean isolated checkout. Re-read AGENTS.md and
   this document. Compare the installed entrypoint, adapter and required helpers
   with the exact reviewed source; preserve local core/autostart customizations.
   The pre-repair repository adapter's LF-normalized SHA256 is
   `84babc0fac67524b8cd64fbaccb948f8d6b3e0263900b95f52b608c4691ce1ee`.
   If installed adapter content differs, review and preserve its local changes
   before preparing the surgical delta; never overwrite it blindly.
2. Capture current broker positions, all-client working orders, exact completed
   close orders/executions and the affected journal state, plus effective runtime
   EOD/partial-fill configuration (without printing secrets). Reconcile any
   external/manual activity. The repair is not authorization to manually flatten
   a position after hours or rewrite its ledger. Unproven previous-day coverage remains
   blocked after restart; resolve from real evidence through the existing
   reconciliation procedure, not by clearing guards.
3. Use an off-market controlled maintenance window. Stop only the identified
   bridge worker AND its reload supervisor. Confirm neither can reload the file.
   Leave TWS, ngrok and unrelated processes/orders untouched. Back up the adapter
   and current journal/inbox/outbox separately; never restore state over new
   executions. Preserve the existing launch environment, including the EOD flag
   injected by the autostart script.
4. Compile the staged adapter with the existing bridge Python, then install only
   the reviewed adapter delta. No core, entrypoint, helpers, secrets or parameters
   need changing for this repair. Do not invoke the broad legacy deployment
   script blindly: it replaces other files and can copy before stopping reload.
5. Restart through the verified existing launch method and compare installed
   adapter SHA256 with the reviewed candidate. Read `/ib/status` and
   `/ib/smio-demo-status`: require the intended connected simulated account,
   ready=true, task_running=true, effective EOD=true, version=20261112.1 and
   advancing maintenance timestamps. Re-read positions and all-client orders.
6. Verify a permitted natural paper close/EOD lifecycle from exact order IDs,
   fills, broker-flat position, no residual owned orders, one closed ledger row
   and one callback. Do not create a synthetic trade to claim acceptance.

Rollback: stop the same worker/reloader, restore ONLY the backed-up adapter,
and restart with the same verified environment. Preserve all journals, inbox,
outbox and new broker executions. The old adapter can read the additive fields
but retains the exhausted-retry/EOD defect, so unresolved positions still need
evidence-based review. A repository revert alone does not roll back Windows.
