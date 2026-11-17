# ES Straddle Machine — isolated TWS paper candidate

Handbook update required: YES.

## Owner-approved strategy — November 16, 2026

At 20:20 America/New_York on eligible ES trading evenings, sell ten
straddles (ten calls plus ten puts) as one ratio-1:1 CME BAG. Use the verified
current ES futures contract, nearest available ATM strike (tie: lower strike),
same strike and PM expiry for both legs. Choose the earliest listed upcoming
expiration within four calendar days, verified by both IB ContractDetails to
expire at 16:00 ET. Require the same underlying conId, $50 multiplier, USD, and
an IB trading-hours interval open at entry. Never infer PM expiry from a symbol
or use a stock-market holiday calendar for ES. Missing/ambiguous PM metadata,
closed sessions and early expiries skip entry.

Sell at the initial combined bid/ask midpoint. Freeze that limit; never chase
or use a market entry. The exact midpoint must lie on the locally verified combo
tick grid; otherwise skip instead of silently repricing.

Profit BUY LMT = ceil(actual weighted entry credit * .865 / .25) * .25.
50.50 credit -> raw 43.6825 -> 43.75. Exact quarters stay unchanged.

Mayday triggers when fresh real-time call ask + put ask >= actual weighted
entry credit * 1.65. Cancel/confirm the target and market-close the proven
residual. 50.50 credit -> 83.325 trigger. This is a trigger, not a guaranteed
execution price. The combined leg asks can differ from a native combo quote;
this explicit buyback-cost interpretation requires supervised paper acceptance.

At expiry-day 15:55 ET, irrespective of quote freshness, cancel the remaining
entry and target, confirm termination, then close the execution-proven residual.
An unfilled entry waits unchanged until this cancellation. No fill means no
trade. First partial entry cancels its unfilled remainder; after confirmation
and position synchronization the target covers actual final filled quantity
at the actual weighted premium. No old research exits, MES hedge or second
target are activated.

## Architecture and operation

Standalone package es_straddle, never imported by the stock bridge or app.js.
No Render, chart, Telegram, workbook, stock execution or secret changes.
core.py is a deterministic command coordinator. tws.py observes real contracts,
quotes, orders, executions and positions, persists write-ahead reservations,
then performs broker effects. Submission or a market touch never means fill.

ONLY an exact DU paper account on loopback 7497/4002 is accepted, with a nonzero
client ID and explicit --paper-execute. Default is read-only preflight.
There is no live-account override in this candidate.

Both BAG legs are BUY oriented. SELL of this BAG shorts both for positive
credit; BUY closes both. ENTRY is DAY, TARGET GTC, closing MKT is DAY.
outsideRth is requested for the futures-options session, but TWS can normalize
that attribute to false for a CME combo. It is not an order-identity field;
account/client/order/permanent IDs, exact legs, action, quantity, type, price
and TIF remain checked independently, as do contract trading hours. Actual exchange
acceptance must be observed in TWS; Python types alone do not prove support.

Use Python 3.11+ on the TWS computer in a separate checkout/environment:
  python -m pip install -r es_straddle/requirements.txt

Independently verify the DU paper account, API port, unique nonzero client ID,
current ES future conId (not continuous/MES), real-time options permissions,
clock, and combo minimum price increment. Never commit account values.

Read-only preflight, substituting verified local values:
  python -m es_straddle --account DU_PAPER_ACCOUNT --underlying-id ES_CONID --combo-tick VERIFIED_TICK --expiry-timezone America/New_York --history-timezone America/New_York --history-days 1 --state-dir C:\es_straddle_state

The timezone values above are examples, not defaults: verify TWS API timestamp
settings and expiry-day trading hours. Private JSON defaults can instead be
loaded with --config PATH. Execution flags are not accepted in that file.

After supervised acceptance establishes manual/all-client execution visibility,
--history-all-clients-verified attests that evidence. Only then can explicit
--paper-execute enable paper effects. Neither flag is installed in the local
launcher. Do not attest coverage from an empty response or a single day's sample.
Start before 20:20 ET; keep running through exit and subsequent eligible nights.
The local process owns timing; no ChatGPT scheduled trading task is installed.
Friday/Saturday entries are skipped. Review the explicit underlying conId on
futures rollover. An expired/wrong future must not be hidden by a continuous
symbol. A PR, installation or --help does not log in, schedule or place orders.

Keep a persistent state directory outside the repository. Never run another
copy with a different state directory to evade locks or ownership checks.

## Bounded guarantees and remaining gates

- Filesystem process lock; atomically replaced, fsynced command reservations
  BEFORE broker effects. Storage failure prevents the effect.
- All-client visible orders and exact account/contract ownership checks.
  Exact refs and execution IDs distinguish fills. Position on BOTH legs must
  equal confirmed entry fills minus confirmed exit fills before market orders.
- First partial entry cancels the remainder before target placement. Unknown
  cancellation/acknowledgment stays blocked, never blindly resubmitted.
- Target fill during cancellation produces no reverse close. A partial target
  closes only its synchronized residual. Stale positions prevent submission.
- One market close outstanding; at most two residual replacements after proven
  terminal failures, retaining cumulative fills. No timeout cancels a working
  partial market order merely to retry.
- Mayday is a LOCAL watchdog, not a broker-native stop. It and 15:55 require
  this process/network/TWS/data connection. A GTC target may remain broker-held
  after failure; no emergency execution guarantee applies during outages.
  Market orders can slip or be rejected.
- Version-2 recovery journals retain exact contracts, frozen entry price,
  state, broker order IDs reserved before submission, bound permanent IDs,
  execution IDs/components, terminal observations and a history checkpoint.
  An OS-owned lock releases on process death. Restart requalifies the saved
  legs; it never selects a new ATM or replays saved commands. Version-1 active
  journals, identity mismatches and persisted foreign activity require review.
- Disconnects invalidate quotes and connection generation. Bounded reconnect
  uses only this client's socket. Every recovery pass requires fresh own/all
  open orders, completed orders, executions and positions. Missing acknowledgments
  remain UNKNOWN; full exact fills can prove completion. Partial fills need
  terminal-status evidence before a replacement. Completed callbacks omit API
  IDs: adopt only a previously bound permId and use order.filledQuantity.
- The checkpoint advances only after all snapshot requests finish. Same-process
  continuous callbacks cover midnight; reconnect/restart requires the checkpoint
  inside the explicitly verified TWS history window. Today's history cannot
  heal an overnight gap. TWS can expose up to seven days when its Trade Log is
  configured accordingly; Gateway is current-day only. Unprovable gaps, corrections,
  timeouts and ownership/position mismatches block effects instead of guessing.
- Supervised TWS paper acceptance must verify actual combo support, expiry/time
  metadata, tick grids, fill shapes, target acceptance, partial fills,
  cancellation race, Mayday, EOD, interference and restart/disconnect behavior.
  These active-order recovery acceptance checks remain required before any
  unattended paper use. Live trading is outside this candidate's scope.
- Entry tolerance is the 20:20 minute. Slow preflight or missing real-time data
  skips rather than submitting late. IB metadata can conservatively skip
  entries when it cannot prove a session/PM contract.
- No chart or Option Journal publication is added. Existing publisher and
  stock bridge remain separate.

## Offline verification

  python -m compileall -q es_straddle tests/test_es_straddle.py
  python -B -m unittest discover -s tests -p 'test_es_straddle*.py' -v

CI runs these on Python 3.11/3.12, installs the pinned adapter dependencies and
checks --help without broker access. Fixtures test pricing, PM expiry/DST,
no chase/no fill, partial entries, Mayday threshold/stale data, EOD,
target-cancel races, residual sizing, unknown acknowledgments, ownership,
continuity, retry caps and exact execution evidence. Offline success is not
broker acceptance or proof of Windows installation.

## Windows installation and read-only evidence — November 16, 2026

Installed under the task's `outputs/es-executor`, with its own Python 3.12 venv,
private local-config.json, state directory and Preflight.ps1. No service, startup
task or execution loop was enabled. No broker orders were placed, canceled or
changed. The deployed stock bridge source matched the repository, its .env hash
was unchanged. The owner later stopped the stock bridge independently and
confirmed that action; this task left it stopped. Shared TWS settings were
inspected without changing them.

Read-only API evidence: standard paper port 7497, verified DU account, separate
client 1820, server 176, ESZ6 underlying conId 515416632, live future and option
quotes. One preflight selected the November 17 16:00 ET 7440 pair and exact
70.00 midpoint. This is a dated observation, never an entry instruction.
The account already held an externally managed ten-lot ES straddle with a
working combo order. Fresh entry correctly failed the foreign-activity gate;
no adoption or modification of that trade occurred.

Local discoveries fixed in the adapter:
- Pinned ib_insync 0.9.86 does not accept raiseSyncErrors on IB.connect.
- Option-chain underlyingConId arrives as a string. Selection now normalizes it
  and searches subsequent dates when the first listed date is not valid PM expiry.
- This TWS emits lastTradeTime in operator time while tradingHours remains in
  the instrument timezone. Explicit expiry timezone must agree with the final
  expiry-day hours endpoint; an early close fails the required 16:00 ET proof.
- CME market rule 235 is premium-dependent (.05/.10/.25/.50 bands). Entry
  checks the configured tick against the returned band and skips an off-grid
  exact midpoint. The target formula stays rounded UP to .25. If its exact
  result is not exchange-valid, the coordinator follows the existing unprotected
  target failure exit path; it never silently changes that target price.

The installed adapter passed a real read-only disconnect, same-client reconnect
and fresh-adapter journal restore using an unopened fixture outside operational
state. Exact leg IDs were preserved; foreign orders were unchanged; persisted
foreign activity blocked restart. This does NOT prove recovery of active orders.

At the initial inspection, readiness was **BLOCKED** and TWS Trade Log showed Today, although
execution download is All Available; sampled history includes manual client 0
and stock client 77. Master Client ID is blank. Do not change shared routing
without assessing stock-bridge impact. Before unattended use, establish and
verify a history window covering overnight outages plus continuous/manual/all-
client visibility, reconcile the external ES position, then supervise actual
owned combo/target/partial/cancel/Mayday/EOD and active-order restart acceptance.
The local history attestation is deliberately unset. Local tests: 83 passing
offline regressions on Python 3.12; CI also exercises Python 3.11 and 3.12.

Broker references: [IB execution history and corrections](https://www.interactivebrokers.com/docs/tws-api/doc/order-management/execution-details),
[IB master-client visibility](https://www.interactivebrokers.com/docs/tws-api/doc/order-management/master-client-id),
[CME premium-band change notice](https://www.cmegroup.com/content/dam/cmegroup/notices/clearing/2025/chadv25-390r.pdf).

### Authorized history follow-up — November 16, 21:32 ET

The owner authorized configuring history and technical checks. On reopening
Trade History the period was already Last 5 Days; read-only API returned 543
executions from November 12 onward. Set Last 7 Days and checked Save this
selection. Reopening the Trades window retained Last 7 Days. A new client-1820
connection returned 827 executions dated November 10–16 ET, including manual
client 0 and stock client 77. The same history remained available after closing
the Trades window and reconnecting the API. Order and ES-position fingerprints
were identical before and after. No orders were submitted, canceled or modified.

Updated only the isolated private config's history_days from 1 to 7. No Master
Client ID, routing, API security or stock bridge setting changed; stock source
and .env hashes remain unchanged. This supersedes the initial Today-history
blocker, but does not certify an actual cross-midnight outage or TWS restart.
Continuous all-client visibility and owned active-order recovery acceptance
remain unverified. The external ES trade still blocks new entry. Execution,
history attestation and unattended startup remain disabled. Recheck history
after a TWS restart before relying on the saved seven-day window.

### Existing overnight watchdog confirmed

The owner's TWS Intraday Watchdog is scheduled every minute. It waits 30 seconds
for TWS self-recovery, then starts C:\IBC\StartTWS.bat if necessary and waits
up to 180 seconds for API availability. The launcher points to
%USERPROFILE%\Documents\IBC\config.ini, whose active mode is paper. Do not infer
the active mode from the unused C:\IBC\config.ini. The watchdog also repairs
Excel RTD; it does not manage the new es_straddle process or its order journal.

Read-only log evidence on November 16: API unavailable 02:45:03, IBC start
02:45:42, API recovered 02:46:01, TWS/API and Excel RTD healthy 02:47:51 ET.
This establishes actual prior overnight TWS recovery. The remaining overnight
acceptance is the new executor's reconnect, history revalidation and exact
owned-order reconciliation across that existing recovery cycle. No second TWS
restart mechanism was installed, and no watchdog/IBC settings were changed.

### Controlled one-lot paper acceptance — November 16, 21:52–21:59 ET

The owner reported the external straddle closed; API verified both old legs at
zero and no working ES order, with final closing executions at 21:45:07 ET.
Because the 20:20 window had passed, the owner explicitly approved a separate
one-straddle technical test now, including immediate cleanup after recovery
checks. The normal ten-lot strategy, schedule and exit rules were not changed.

An isolated fixture used the installed adapter/recovery primitives, a separate
private journal and unique ESTEST order refs; it did not enable the unattended
coordinator or attest all-client continuity. A 7440 November 17 16:00 ET combo
was submitted SELL 1 at exact initial midpoint 67.75. Abrupt test-process exit
exposed a TWS normalization: outsideRth returned false after reconnect while
all identity/price/quantity fields matched. Exact targeted cancellation confirmed
zero fill and flat positions before further testing. The fix treats that flag
as normalized metadata, retaining exact IDs/legs/price/quantity/type/TIF checks.
IB documents this behavior under [warning 2109](https://interactivebrokers.github.io/tws-api/message_codes.html).

The bounded repeat retained the same 67.75 limit (no chasing). Its working
entry survived abrupt process death and reconnect with the same broker IDs;
it subsequently filled one combo at 67.75. The completed callback reported
totalQuantity=0 and filledQuantity=1. Recovery now normalizes this zero remaining
quantity only when exact full-quantity executions independently prove Filled;
missing/unpaired executions still fail closed. The test covers that boundary.

Calculated BUY 1 GTC target 58.75 was accepted and restored after another abrupt
process exit and API reconnect, with unchanged IDs and price and no duplicate.
After cancellation confirmation, authorized technical cleanup bought back the
proven one-combo residual at 68.50. At 21:59:27 both legs were flat, no test orders
were working, and non-ES positions were unchanged. A new read-only connection
independently confirmed completed entry/close fills and canceled target.

Scope of acceptance: real working-order and filled-order recovery, target
acceptance/restoration, exact cancellation and one-lot residual market close.
This does not certify the complete ten-lot coordinator, natural partial fills,
Mayday, the actual 15:55 deadline, continuous all-client visibility, or the new
executor across the 02:45 TWS/IBC cycle. Those gates remain; live trading and
unattended startup remain disabled. No test journal was put in operational state.

### Owner-authorized paper training supersession

After the controlled acceptance, the owner explicitly authorized turning demo
autotrading on and using the paper account as a training ground while resolving
remaining issues. This supersedes the earlier decision to keep unattended
startup disabled. It does not certify the pending tests or authorize live trading.

Use both `--paper-execute --paper-training` for this explicit opt-in. Training
permits execution while all-client history acceptance remains pending; it does
not set `--history-all-clients-verified` or claim `paper_ready`. DU account and
paper-port restrictions, history checkpoint coverage, foreign-activity blocks,
exact ownership, cancellation confirmation and frozen prices remain enforced.
No size/schedule/expiry/target/Mayday/EOD parameter changes are made. Starting
outside the 20:20 minute waits for the next eligible scheduled opportunity.

`state/status.json` contains a throttled atomic heartbeat, actual connection,
mode, phase, pending-acceptance flag and next scheduled opportunity. It is not
broker fill evidence. `state/logs/runtime.log` rotates at 2 MB with five backups.
Phase transitions are timestamped in the log for later overnight-recovery audit.
The private account is redacted from these status/log messages. Exact broker
evidence remains in private session journals; do not publish those journals.

The local Windows task **ES Straddle Paper Training** launches the isolated venv
with these two explicit flags, at user logon and every minute. IgnoreNew plus the
OS process lock prevent duplicate workers. The task has no execution time limit
and restarts failures. It requires this Windows user to remain logged in; the
computer must stay awake, and TWS must be connected to paper. The existing TWS
watchdog continues to own TWS/IBC recovery; this task only supervises ES Python.

Local controls in `outputs/es-executor`: `Start-Paper.ps1` resumes new entries,
`Status-Paper.ps1` reports heartbeat age and task/runtime state, and
`Pause-Paper.ps1` creates `state/pause-new-entries.flag`. Pausing prevents new
entries; a started session continues target/Mayday/EOD/recovery until resolved.
It does not immediately close a position. Keep task supervision enabled while
paused so unresolved sessions recover after process failure. Never delete a
journal to clear a hold. Runtime error recovery does not automatically edit code.

91 offline regressions cover the new opt-in, honest acceptance status, schedule
and pause-before-submission boundary in addition to earlier recovery checks.
Natural 02:45 recovery, retained history, full coordinator/partial/Mayday/15:55
acceptance remain pending and must be recorded from actual paper evidence.

Observed November 16 at 22:19–22:24 ET: the local task was activated and reported
PAPER_TRAINING / WAITING_FOR_ENTRY, connected to the exact paper account with
history attestation false. A separate read-only client verified no ES position
or working ES order. Forced termination of only the verified idle ES worker was
followed by an automatic Windows-task restart and fresh connected heartbeat,
without a manual start command. The pause control produced PAUSED/disconnected;
resume restored the waiting worker. Phase-change logs were verified. The next
scheduled opportunity was November 17 at 20:20 ET, subject to normal preflight.
This activation submitted no orders. Stock source/config hashes were unchanged;
the existing TWS watchdog was left intact. This proves idle process supervision,
not recovery of a ten-lot position through the upcoming natural night outage.

### Manual ES positions in separate contracts

The owner clarified that manual trades will use later expiries such as 2DTE and
3DTE. Remove the earlier symbol-wide ES exclusion: unrelated ES futures/options
positions and working orders no longer block the scheduled entry merely because
their symbol is ES. Isolation uses the selected call/put conIds, not a DTE label.
The automated entry remains next eligible 16:00 ET expiry (normally tomorrow at
the 20:20 entry), so later-dated manual trades must not include either selected
option contract. Different expiry or strike can establish separate contracts.

Manual positions, targets and exits are never adopted or managed. Exact-contract
positions still prevent entry; foreign orders/fills involving either selected
leg still hold the session. An ES BAG with unavailable leg identity also holds
until separation can be proved. A generic ES BAG execution is classified using
its actual legs or an exact account/permanent-ID/order-ref matching broker
order. Proven combo membership is saved in the optional version-2 journal field
observed_combo_contracts so a known separate manual combo stays distinguishable
after reconnect when older completed-order details disappear. This is contract
membership evidence only; ownership and full-fill proof are unchanged. Conflicting
or malformed evidence blocks; an old foreign-activity hold is never cleared.

102 offline tests cover coexistence before entry and during target/EOD management,
exact overlap and unidentified BAG holds, permanent-ID/account/ref mismatches,
contradictory evidence, durable combo membership and owned-quantity-only exits.
A read-only actual TWS audit at 22:37 ET resolved all 21 current-day ES BAG
execution callbacks, including manual activity. The 43 unavailable older BAG
identities were dated November 10–15, before this session; pre-entry executions
are not treated as new session interference. No manual position/order was created,
changed or canceled to test coexistence; active coexistence remains covered by
offline tests rather than a new broker trading experiment.

## Rollback

Stop only this isolated candidate. Inspect/reconcile its owned paper orders
and positions; preserve journal and unresolved GTC orders until reconciled.
Never stop the stock bridge or TWS as part of this rollback.
Reverting source does not cancel broker orders. Revert only this candidate PR;
no production environment or financial-history rollback is required.
