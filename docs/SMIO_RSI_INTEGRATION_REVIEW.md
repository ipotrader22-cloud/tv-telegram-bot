# SMIO_RSI experimental demo integration â€” 2026-10-13

Handbook update required: YES. Deployment/e2e status is recorded separately below.

## Approved experimental boundary

The owner confirmed `SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013`: use Pine
v0.1 trading behavior, $1,000,000 chart initial capital, 10% of chart equity,
reject fractional shares without rounding, and permit orders only on the verified
simulated shared TWS session. The owner authorized deployment and TV alert creation
with TWS demo execution. Live accounts remain excluded. Trading Lab's research
freeze is absent; no production strategy approval or Pine/NT8 parity is claimed.

The supplied task and Trading Lab handoff were inspected, including original and
paper Pine, NT8 and the disabled draft adapter. Pine/NT8 warmup, fill timing, EOD,
and sizing discrepancies remain research limitations; no optimization or signal
changes were introduced. Pine equivalence is enforced by a full-source comparison
allowing only the demo title and transport marker lines.

## Implementation

- Render: strict demo identity/configuration/timestamps/whole qty; exact event-ID
  admission and body-conflict rejection; MARKET entries and reasoned CLOSE intents
  route through the existing /tv bridge path. Broker callbacks require the existing
  quote key. OPEN/CLOSE publish only actual fills, with exact setup IDs and durable
  duplicate protection. Public label is explicitly SMIO_RSI Demo.
- Bridge: same connected IB client/lock, local verified-demo attestation and exact
  UAM snapshots. Write-ahead journal, exact order references, terminal/partial
  fills, target cancellation race, remaining-position closes, execution-history
  coverage, restart observation and ordered durable callback delivery. RSI-only
  has no target; ATR/First-of-Either use the signal's frozen target. No reversals,
  quantity fallback or foreign order cancellation. Outside-RTH closes retain the
  target and queue for permitted RTH even when the shared legacy bridge has its
  optional BLOCK_MARKET_CLOSES_OUTSIDE_RTH switch disabled. Both incoming CLOSE
  and journal recovery are gated; unproven history/ambiguous submission blocks.
- UAM: additive Experimental Demo profile in existing v0.23.2 application; standard
  selected/bulk controls, per-chart strict Properties verification, exact Excel
  Inputs/source snapshots and receiver readiness. Installer verifies baseline
  hashes, backs up targeted files, atomically installs and rolls back on failure.
  Criteria, cookies, settings, original research profile and Prime/Edge are retained.

## Verified evidence

- Source base 73e5f59a2baab1d9db4b46794df8b6fc6fe7b466; feature branch
  feature/smio-rsi-offline-gates; PR #293.
- Last inspected Render deploy dep-db7b49ui0phs738tinlg at base 73e5f59;
  this was the pre-rollout service, not proof the demo changes are deployed.
- Native TWS title explicitly said Simulated Trading; its account matched the
  sole account on the existing bridge API. Account identifiers stay local.
- Existing caps observed: bridge $100,000/order; Render 10,000 shares. Existing
  Render forwarding enabled and dry-run false. No risk caps/secrets changed.
- Installed UAM addon at C:/Users/tradi/Desktop/UAM. Backup:
  SMIO_RSI_install_backups/demo-20261013-204707. Existing UAM suite, paper safety
  checks and four new offline tests passed on the actual installed interpreter.
- Actual saved user criteria on SMIORSI.xlsx yielded 51 candidates. Initial APA
  candidate is 45m, source row 878, SMIO 197/38/13, RSI 3, ATR 2.9, Auto session.
  No winner count or parameters forced; neither workbook was changed.
- Private demo Pine compiled in TradingView. Editor copy matches installed source
  after CRLF normalization. Native Properties readback: $1m, 10% equity,
  pyramiding 0 and on-bar-close. Original research script preserved separately.
- 132 offline bridge tests passed, including 15 SMIO lifecycle tests and existing
  Edge/Prime protections. Authenticated Render callback/ledger tests pass for
  BUY/SELL and all target modes, including one OPEN/CLOSE across duplicate delivery.
- SMIO gate, broker EOD, fast ACK, Edge pending/EOD lifecycle tests passed.
  app.js and deployment-script syntax passed.
- Full Edge integration has the same pre-existing dashboard canonical setup-ID
  visibility assertion as untouched origin/main; no unrelated UI fix included.

## Rollout and limits

Backend merge/deploy, bridge restart, initial UAM APA alert creation and actual
signal-to-broker fill validation: NOT YET VERIFIED in this checkpoint.
No all-51 activation and no real-account orders. No synthetic live webhook/order
is used as evidence of a real TradingView signal. Fractional Pine quantities
remain rejected as expressly selected; target precision is not silently changed.
Ambiguous broker submission and unproven history require reconciliation/review.
Research robustness, NT8 parity and live sizing/production approval remain separate.

Rollback: restore the UAM code backup/profile additions, revert the feature merge
and restore all backed-up bridge dependencies together. Do not delete journal or
callback outbox state while a position/order is unresolved. Disable the affected
TV demo alert before rolling back its receiver. Documentation export is a local
snapshot only; upload and production deployment are separate facts.

## 2026-10-14 scoped RTH safety correction

- Source trace found that SMIO demo CLOSE previously consulted the *shared optional* `BLOCK_MARKET_CLOSES_OUTSIDE_RTH` setting, so a false value could allow an out-of-session close or recovery pass to cancel the attached target and submit a market order.
- The SMIO-specific adapter now checks `is_us_stock_rth_now()` for every close, independent of the shared switch; it persists the signal reservation and keeps the owned target intact outside RTH.
- The broker-fixture regression tests the shared switch OFF, repeated outside-RTH reconciliation (no target cancellation, no market close), and resume inside stock RTH. It does not mutate Prime/Edge behavior or Trading Lab entry/exit conditions.
- These are source and offline test assertions; broker session behavior, holiday calendar verification, real TradingView delivery and demo TWS execution are still NOT YET VERIFIED. Live-account execution remains forbidden.

## Staging dependency observed 2026-10-14

Do **not** merge the server's executable demo webhook path before confirming that the destination local bridge has been replaced by the reviewed SMIO-aware adapter. The Render PR can accept strictly tagged demo `SETUP` payloads and forward them over the existing shared route; the previous bridge's handling of that new payload cannot be treated as a safe or verified rejection. UAM's receiver check guards automated alert creation but is **not** a server-side transport guarantee against arbitrary/manual webhook deliveries. Keep the PR unmerged until bridge-first deployment safety is confirmed, or add and test a fail-closed server-side downstream readiness gate in a separate scoped patch.

Before any local bridge restart, inspect current open orders/managed positions and choose a window that does not interrupt existing Prime/Edge positions. Require local attested simulated-session status and the backup/rollback procedure; a repository commit or a static attestation file alone does not establish the running account's state. After bridge confirmation, merge/deploy Render and recheck the exact deploy, then create only APA 45m. This note is a release gate, not an authorization to restart TWS, deploy the bridge, merge the PR, or place an order.

## 2026-10-14 owner-provided local read-only bridge evidence

The owner ran read-only GETs to `http://127.0.0.1:8000/ib/status` and `/ib/smio-demo-status`. The reports show the shared bridge **connected**, `dry_run=false`, stock RTH **false**, the legacy `block_market_closes_outside_rth=false`, and the SMIO endpoint returning the exact experimental contract with `demo_only=true` and `ready=true`. The connected account identifier is intentionally not copied into Git, logs, or this report.

This confirms that a local runtime exposes the SMIO demo readiness route, **not** that its running adapter contains the October 14 RTH correction, that its disk files match this PR head, or that the TWS window still visibly identifies a simulated session. The readiness method checks the saved local UI attestation and account match; it cannot independently prove the TWS window label at the time of the GET. Live broker orders remain prohibited. At the time of this record the Render service also remained on a non-SMIO PR commit, and PR #293 remained draft/unmerged.

**Next release gate:** read the installed adapter's exact `close()` RTH guard and file/process timestamps without restarting the bridge. A legacy guard conditional on `BLOCK_MARKET_CLOSES_OUTSIDE_RTH` requires deployment of the reviewed dependency set at a safe window; `ready=true` is not grounds to merge or create alerts. Then independently inspect TWS simulated-session identity, outstanding orders/managed positions and the Render/bridge rollout sequence before staging one APA 45m demo alert.

## 2026-10-14 bridge pre-restart diagnostic checkpoint

Owner-provided local PowerShell evidence: the installed `C:\\ib_bridge\\smio_demo_adapter.py` passed `py_compile`, was backed up before an atomic file replacement, and now displays `if not self.core.is_us_stock_rth_now():` at the SMIO-only close guard. The owner preserved the prepatch backup; its filename and machine/account-identifying data are not recorded in the repository. This establishes **disk source patched**, not in-memory loaded module equivalence.

Read-only broker endpoints at the moment of inspection reported **zero** positions, **zero** open orders, **zero** managed positions, and **zero** pending Render-outbox items. The bridge continued responding `ok=true`, `connected=true`, `dry_run=false` and `is_stock_rth_now=true`. This is only a point-in-time snapshot; orders and positions may change while the market is open. The earlier demo contract readiness GET returned ready=true; no fresh UI simulated-session banner evidence accompanied this checkpoint.

Windows `Get-NetTCPConnection` reported a listener PID that `Get-Process` could not resolve. A second process discovery returned no valid process identity. The computed `RestartRequired=True` from a null PowerShell process object is **invalid/unverified** and must not be used as a restart decision. Investigate port listener ownership (TCP/netstat + process inventory), running Python executable and startup method **without interrupting** any processes. No bridge restart, Render deployment, PR merge, alert creation, or test trade was performed as part of this checkpoint.

Release gate: identify the actual active bridge process and verify that the patched disk adapter is loaded only after a controlled safe-window restart, with refreshed broker positions/orders, no pending callback deliveries, and independent TWS **Simulated Trading** confirmation. The server/bridge version sequencing guard remains unresolved; do not merge the executable Render path until it is resolved.
