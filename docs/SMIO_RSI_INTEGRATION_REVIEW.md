# SMIO_RSI integration inspection — 2026-10-13

Status: partial offline safety preparation; full integration NOT COMPLETE.
This report is evidence for a proposed feature branch, not a deployment manifest
or Trading Lab approval. Handbook update required: YES.

## Sources and state

- Task attachment recovered from the referenced chat: `Pasted text.txt`.
- Local AGENTS.md, UAM AGENTS.md, repository handbook and source index inspected.
- GitHub source index selects `VIXALE-WEBSITE-CURRENT-STATE-2026-10-07-PR282.md`;
  local original checkout selected PR247. Original checkout is stale; untouched.
- Isolated repository cloned from the existing checkout and fetched from GitHub.
  Base: `73e5f59a2baab1d9db4b46794df8b6fc6fe7b466`.
  Branch: `feature/smio-rsi-offline-gates`.
- Render read-only provider record: `dep-db7b49ui0phs738tinlg`, status live,
  same base commit, finished `2026-10-13T22:36:16.792952Z`. Runtime startup logs
  and end-to-end broker behavior were not verified in this task.
- Repository and installed `C:/ib_bridge/ib_bridge.py` entrypoint hashes matched
  before edits: `d055cb36a3d0b1d8bf982c52f58b866cc79e89bffe6fa6aeefed7acacb8ce442`.
  Matching entrypoints alone do not establish all installed dependency versions,
  connected account, running process version or broker health.
- Trading Lab package found at
  `C:/Users/tradi/.codex/.chatgpt-projects/g-p-6a8061532b508191b65e60c32c9f33c9/outputs/SMIO_RSI/SMIO_RSI_Engineering_Handoff.zip`.
  Archive integrity passed. Read handoff, research specification, paper Pine,
  NT8 companion and disabled draft adapter. No UAM.zip was found; actual installed
  source at `C:/Users/tradi/Desktop/UAM` was used instead.
- Existing shared boundary: TradingView -> Render app.js -> bridge background
  dispatch -> handle_ib_action -> broker -> durable callback -> public ledger.
  SMI Histogram is a different strategy with a 3% contract; its identity and
  target-required executor must not be repurposed for SMIO RSI-only exits.

## Approval and execution blockers

The recovered Trading Lab handoff explicitly states NOT APPROVED FOR DEPLOYMENT
and Research Freeze absent. Earlier basket-paper authorization is not a frozen
real-account contract. The user's desired shared-session routing is preserved;
no separate broker account, endpoint or execution engine was installed.

Trading Lab must resolve and freeze:

1. NT8 200-bar warmup versus Pine's lack of that gate, recursive indicator
   seeding and flat-series behavior.
2. NT8 next-bar order fills versus Pine process_orders_on_close and immediate
   RSI/EOD closes; approved signal timing and bar alignment.
3. NT8 preventive EOD cutoff and native session-close behavior versus Pine's
   final custom-session bar; holidays, early closes and extended-hours exits.
4. Exact live whole/fractional quantity contract, account/equity provenance,
   basket exposure and caps. Unrounded TV research quantity based on $1,000,000
   and 10% per chart cannot silently become live account sizing.
5. Approved frozen identifiers, parameters, target/RSI precedence and validation
   evidence (Pine/NT8 parity, WFO/OOS/robustness as required by Trading Lab).

Engineering work still required after the contract is available: strict frozen
payload validation, persistent event/body conflict detection, freshness,
setup-scoped entry ownership and broker identity, RSI-only close handling,
partial fills, exact target cancellation races, restart/retry reconciliation,
broker-confirmed callbacks/publication and verified UAM snapshots.
No approved production Pine or broker executor is delivered by this patch.

## Offline changes

- `app.js`: reject reserved SMIO identities before admission, stop direct
  lifecycle/callback processing and old Inbox replay before stale cleanup.
- `lib/smio-rsi-gate.js`: conservative reserved-identity classifier.
- `bridge/smio_rsi_gate.py`: reject action and background paths before broker
  handling/callbacks; no quantity fallback or activation switch.
- `bridge/ib_bridge.py`: install that isolated wrapper after existing adapters.
- `scripts/deploy-ib-bridge.ps1`: compile/copy/back up/restore the new module.
  Syntax checked only; never executed.
- `tests/test_smio_rsi_gate.js`, `tests/test_smio_rsi_gate.py`: offline boundary
  and pass-through tests.
- `docs/VECO_DEVELOPER_HANDBOOK.md`, this report: scope, gates and evidence.

Pine, bridge core, Prime/Edge classifiers, UAM source, profile criteria and
installed runtime directories were not modified. Existing original checkout's
untracked caches were not discarded.

## Verification

PASS:

- Node syntax check for app.js; Python compile for gate and entrypoint;
  PowerShell deployment-script parse; git diff whitespace check.
- SMIO Node tests: object/text/Buffer ingress; BUY/SELL/close-family callbacks
  with each reserved identity; mixed legacy identity; old Inbox replay before
  foreign Pending cleanup; repeat completed replay.
- SMIO Python tests (2): rejected quantities including missing/fractional,
  LIVE relabeling, no generic/background delegation, repeat installation and
  concurrent unchanged Prime/Edge/SMI pass-through.
- Existing SMI Render contract, bridge isolation, concurrency and runtime safety.
- Existing Edge bridge isolation and Prime/Shrek EOD: 121 offline tests.
- Edge Pending lifecycle and EOD cleanup; durable webhook fast ACK.
- Copied installed UAM `tests/run_tests.py`: Edge/Prime selection, mapping,
  duplicate/status/snapshot safety and SMIO no-alert tests.
- Local Excel parsing with default code criteria, not the user's saved GUI criteria:
  `SMIO_RSI .xlsx`: 1950 rows, 208 eligible, 57 winners;
  `SMIORSI.xlsx`: 1950 rows, 247 eligible, 51 winners. Both parse successfully.
  These are separate workbooks; no winner count is enforced or user criteria changed.

FAIL, reproduced on untouched origin/main:

- `tests/test_vixale_edge_app_integration.js`: dashboard canonical Edge setup_id
  visibility assertion at line 375. No unrelated dashboard fix included.

NOT RUN:

- SMIO broker entry/exit/ATR/First-of-Either/EOD/race/restart execution acceptance
  tests (executor and approved contract absent).
- Pine/NT8 compilation, numerical parity or strategy backtests in this task.
- Browser alert creation, alert snapshot readback, broker connection/order tests,
  production deployment/startup checks and user-session changes.

## Review and rollout

This patch is a draft safety boundary, not complete end-to-end integration.
Do not merge or deploy from this task. No alerts (including APA 45m or all 51),
orders, bridge restarts, environment changes or automatic activation are authorized.
The user must obtain the frozen Trading Lab contract and live sizing decision
before the execution integration can be completed and staged for approval.

Rollback for this proposed source patch: revert its feature commit; if a later
separately authorized bridge rollout occurs, restore the backed-up entrypoint
and dependency set together. This patch creates no broker or trading-ledger state.
Documentation export/upload: NOT PERFORMED; central exporter points to other
working copies and cannot be presented as an export of this isolated branch.
