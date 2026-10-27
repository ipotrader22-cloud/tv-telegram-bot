# SMIO CLOSE/EOD incident — 2026-10-26

Status: engineering candidate; incident NOT resolved. No local runtime deployment,
restart, order, cancellation, scheduler activation, journal repair or stale replay
was performed in this investigation. Paper execution acceptance remains pending.

## Findings

1. The installed failsafe was **enabled**, contrary to the initial hypothesis.
   A read-only inspection of the running bridge process found
   `SMIO_DEMO_EOD_FAILSAFE_ENABLED=1`. `Vixale_AutoStart_v3.ps1` injects the variable
   into its child process. The inspected shell and `.env` were not authoritative
   for the already-running Python process.
2. SBUX and OXY first reached Render **after 16:00 ET**. Their 15:30 timestamps
   describe bar starts; the supplied bar-close timestamp is 16:00. The frozen
   Pine emitter uses confirmed bars / once-per-bar-close. The RTH guard explains
   why these deliveries could not initiate an allowed market close. Changing
   Pine signal timing is outside this patch's authorization.
3. NKE reached the bridge at **14:30:24 ET**, inside RTH. Its first handler
   evaluation, first failure and cancellation attempt time were not retained.
   The later RTH blocker is not evidence that the first attempt was outside RTH.
   NKE's initiating failure remains **unverified**.
4. The reason the enabled 15:55 failsafe missed these positions is **unverified**.
   Installed code has sequential reconciliation followed by EOD in one try block,
   with unbounded broker refresh calls. An exception or stalled refresh can
   suppress/delay EOD. Those mechanisms are demonstrated in offline fixtures;
   no surviving runtime trace establishes which happened on October 26.
5. Broker history shows external exits, not SMIO market-close executions, in the
   available current-day query. The journal now marks the three setups
   `OWNERSHIP_LOST`. No historical execution or dashboard repair is inferred.

## Evidence and chronology

Times below are October 26, 2026 in America/New_York (UTC−04:00). Exact alert
creation time is unavailable; bar-close metadata is not proof of alert emission.

| Stage | NKE | SBUX | OXY |
|---|---|---|---|
| Original broker entry | 10:30:22, +2,801 | 10:30:10–11, +956 | 11:30:12–13, +1,657 |
| CLOSE reason | RSI_STOP | RTH_EOD | RTH_EOD |
| Signal bar start | 13:30 | 15:30 | 15:30 |
| Signal bar close | 14:30 | 16:00 | 16:00 |
| Render Inbox Received At | 14:30:21.565 | 16:00:11.110 | 16:00:19.004 |
| Render forward log | 14:30:24.134698 | 16:00:14.039952 | 16:00:30.812827 |
| Bridge HTTP 200 logged by Render | 14:30:24.420293 | 16:00:14.368781 | 16:00:31.123699 |
| Inbox completion, attempt 1 | 14:30:24.420 | 16:00:14.367 | 16:00:31.124 |
| Handler entry / durable signal save | Unverified | Unverified | Unverified |
| Initial RTH evaluation / first error | Unverified | Unverified | Unverified |
| Reported later journal state | TARGET_CANCEL_PENDING | TARGET_CANCEL_PENDING | TARGET_CANCEL_PENDING |
| Recorded close order/submission time | Missing | Missing | Missing |
| Original target completed status | Cancelled by Trader, 19:08:17 | Cancelled by Trader, 19:07:36 | Cancelled by Trader, 19:08:06 |
| External broker exits observed by 21:20 | 2,801; last fill 19:51:34 | 796; last fill 21:06:06 | 1,657; last fill 20:05:43 |
| Broker quantity at 21:20 snapshot | 0 | +160 | 0 |
| Bridge quantity at 21:29 snapshot | 0 | +136 | 0 |

The broker exit executions have client 0 and blank order references. None of the
queried incident-symbol exits has an `SMIOC_` reference. The audit did not submit
them. Broker completion messages identify trader cancellation; they do not
identify the human operator. SBUX continued filling externally between snapshots.

NKE also has a later SETUP and a 16:00 EOD signal for a **different setup ID**.
That later EOD signal must not be joined to the earlier NKE position by symbol.

Sources used:

- [Webhook Inbox workbook](https://docs.google.com/spreadsheets/d/1m0skLrbtBY0XRpJjOK-iY0IU1qc94SMnOybeh7C71Jg/edit),
  `Webhook Inbox!A950:K1048` and `L1025:M1048`; no cells changed.
- Render logs, service `srv-d86vh7j7uimc73ao479g`, around 18:30Z, 19:30Z and 20:00Z.
  HTTP success means the bridge accepted background work, not durable processing.
- Local `C:\ib_bridge` journal, adapter/core/autostart source, process environment,
  four read-only status endpoints and the existing stock-session diagnostic.
- TWS UI explicitly identified Simulated Trading; config attestation and exact
  connected account matched. Account identifiers are intentionally omitted.
- Independent read-only IB client 99126 on port 7497 queried executions, positions,
  all-client open orders and completed orders. No auto-binding/order mutation.
  Evidence captured 2026-10-27T01:20:33.528995Z. History scope is the returned
  current-day data, not an unlimited historical guarantee.

The bridge `/ib/open-orders` endpoint reported zero client-local orders while the
independent all-client query found an external SBUX SELL (200 original shares,
40 executed at that snapshot) and four unrelated ES BAG orders. This proves why
client-local absence cannot establish a clear account. Those orders were untouched.

## Runtime provenance

Repository baseline: `3c0c5482ed9d2fd6ce91d61ffa1add0d8d6dc5cc` on main.
Installed adapter SHA256:
`D00476937CC8C89F3F1115294CD41171BC7F09EB5FEFB49C7BADF67A8CBC3897`.
The running bridge started approximately 08:00:10 ET; journal coverage identifies
the same morning process. Runtime RTH configuration was America/New_York,
09:30–16:00, connected, dry-run false, exactly the attested demo account.

The installed adapter includes unmerged #335/#336 EOD and stock-session diagnostic
code absent from main. Its local policy file is also absent from main. The local
core differs from main by a comment; the entrypoint matches. This candidate
preserves the installed EOD additions in the checkout before applying scoped
safety changes. It does not replace `C:\ib_bridge` with the repository version.
Preserving that code in a draft is **not** approval to activate or merge it.

## Candidate corrections and limits

| Mechanism | Candidate behavior | Evidence / limitation |
|---|---|---|
| Session expires during cancellation or refresh | Recheck configured RTH and broker liquidHours; final no-await clock guard before market submission | Deterministic cancellation-boundary regression |
| Broker read stalls while holding lock | Bounded connection/refresh/session queries; invalidate failed execution coverage | Timeout fixture releases locks and blocks mutation |
| Reconcile exception skips EOD | Independently record/run ingress, reconciliation and EOD; isolate each journal row | Error fixture still invokes EOD; bad historical row does not block subsequent positions |
| HTTP acknowledgement precedes persistence | SMIO-only durable receipt before HTTP 200; atomic claim before background dispatch | Failed writes return 503; duplicates do not submit twice; interrupted/expired work is quarantined |
| Foreign order hidden on another client | Refresh all-client open orders; fail closed on foreign working orders | All-client fixture; observed client-local diagnostic blind spot |
| Foreign execution during cancellation/session query | Revalidate execution ownership and current position after awaited work | No residual market close on foreign-fill race |
| OPEN callback backlog suppresses partial CLOSE recovery | Recover terminal/partial close before applying publication ordering barrier | 3 filled + exact 7-share remainder while OPEN remains queued |
| Duplicate queued close bypasses dry-run | Apply dry-run and verified account gates before duplicate retry | No cancel or market order in dry-run/wrong-account fixtures |
| Completed snapshot masks live cancel status | Prefer live broker Trade objects | Live-object identity regression |
| Retry overwrites first failure | Persist first failure, bounded transition history, handler receipt and broker-intent timestamps | Earlier coverage failure retained after later RTH blocker |
| Flat symbol still has working orders | Withhold CLOSED publication | Account/order ambiguity remains blocked |

No strategy parameters, Pine timing, entry/exit reasons, targets, stop calculations,
foreign strategy behavior, Render application logic or historical quarantine rules
were changed. The actual broker session remains the execution boundary, including
half-days; ambiguous schedules fail closed.

**Durable ingress follow-up implemented:** the candidate `/tv` route now calls a
SMIO-only receipt hook before acknowledgement. Atomic receipt and claim writes
close the identified loss window. Failed writes/corruption return HTTP 503;
conflicting event bodies return 409. Fresh same-process work has bounded retries;
unfinished prior-process and expired work are quarantined without replay. The
installed runtime still has the old route until controlled deployment. See
[the ingress ADR](ADR_SMIO_DURABLE_INGRESS.md). Durable acceptance is not execution
confirmation; quarantined work still requires broker evidence and operator review.

Unknown market submission remains a reserved `CLOSE_SUBMITTING` intent until exact
broker evidence resolves it. An absent order is not permission to resubmit. Restart
or connection-generation history gaps remain fail-closed; this can require operator
review. A timeout does not manufacture missing history. Broker-native outside-RTH
restrictions remain in force; local checks alone cannot guarantee arrival before
the exchange boundary in the face of network latency.

## Validation matrix

All results below are **offline**, not live paper acceptance.

| Required scenario | Result / coverage |
|---|---|
| 15:30 EOD signal | Existing close handler allowed inside RTH; scheduler not yet due at 15:30 |
| 15:55 broker failsafe | Regular policy boundary, OPEN-to-close and queued-close maintenance integration pass |
| 16:00 RTH termination | No scheduler close; cancellation crossing end cannot submit |
| Half-day | Broker 13:00 close authorizes 12:55; regular-session assumptions not substituted |
| Holiday / ambiguous session | Fail closed, including conflicting CLOSED segment |
| TWS disconnect / stalled refresh | No mutation; bounded refresh and disconnected fixture |
| Render connectivity loss | Partial-close recovery continues with existing OPEN outbox backlog |
| Restart during close | Before unknown acknowledgement reserves without replay; after broker fill reconciles exact evidence |
| Target fills during cancellation | Full target wins; partial target closes only exact remaining quantity |
| Partial close | 3 + 7 shares, no reversal, one replacement |
| Already-flat broker | Exact target/close fills govern publication; foreign-flat ownership is not adopted |
| Multiple SMIO positions | Two symbols on one fixture connection close once each; blocked EOD/reconciliation rows do not suppress others; paper proof remains required |
| Foreign same-symbol holding/order | Foreign fill/reopen and all-client working orders block close; no foreign cancellation |
| Existing queued CLOSE / duplicate | One close through maintenance/restart; no duplicate market order |
| Missing executions | Unproven coverage / invalid response block action |
| Disabled / enabled config | Disabled is nonmutating; enabled still requires session/account/ownership proof |

Commands run successfully with Python 3.12 on Windows:

```text
python -B -m unittest discover -s tests -p 'test_smio*.py'              # 73 tests
python -B -m unittest tests.test_vixale_edge_bridge_isolation tests.test_smi_forward_bridge_isolation tests.test_bridge_quote_reconnect_adapter  # 115 tests
node tests/test_smio_pine_identity_escape.js
node tests/smio_dashboard_trade_id_regression.cjs
node tests/test_smio_demo_render.js
```

Python asyncio required the approved unsandboxed runner for local event-loop
sockets; all tests used broker fixtures. CI now runs all SMIO Python test modules.

## Historical incidents and shared weaknesses

[PR #340](https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/340) preserves
full setup identity; [PR #346](https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/346)
validates ownership before stale entry publication and quarantines disputed outbox
items; [PR #347](https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/347)
adds an offline publication audit. None proves October 26 close execution.

The shared weaknesses are boundaries between signal receipt, durable intent,
broker ownership/execution and public ledger acknowledgement. A symbol, HTTP 200,
calendar date, cached position or dashboard state cannot stand in for exact broker
truth. Full setup identity and quarantine remain necessary. Historical COP, BE,
APA and BIIB records under [Issue #341](https://github.com/ipotrader22-cloud/tv-telegram-bot/issues/341)
were not reconstructed, replayed or released.

## Read-only operational diagnostic

Run the new CLI from a staged checkout, **not by importing the live core**:

```powershell
python bridge/smio_execution_audit.py --journal C:/ib_bridge/smio_demo_journal.json --config C:/ib_bridge/smio_demo_config.json
```

It reads only existing loopback GET endpoints `/ib/positions`, `/ib/open-orders`,
`/ib/status`, `/ib/smio-demo-status`, plus the config/journal. It writes nothing
unless its stdout is explicitly redirected. Account numbers are redacted. Every
setup includes account match, strategy, broker quantity, journal state, target/
close visibility, signal and handler timestamps, action time, blocker and EOD
health. It also reads the optional sibling `smio_demo_inbox.json` and joins HTTP
receipt time/state by exact event ID. Missing legacy timestamps/health remain null. Client-local order absence
is explicitly not proof of no foreign orders. Independent TWS execution/all-client
inspection is still required before any recovery decision.

New optional journal fields are additive: `signal_receipts`, `first_failure`,
`lifecycle_history` (last 32 distinct transitions), `last_evaluated_at`, and
`last_broker_action_at`. The existing SMIO status endpoint gains additive
`maintenance` data. No new recovery endpoint is introduced. Handler receipt is
not HTTP receipt; historical times are not backfilled.

## Controlled rollout and acceptance gates

[Issue #335](https://github.com/ipotrader22-cloud/tv-telegram-bot/issues/335) permits
engineering/paper preparation. Its comments approve the five-minute lead relative
to actual broker stock close, including 12:55 half-days and closed/ambiguous-session
blocking, but do not establish a completed Trading Lab freeze or paper validation.
[PR #336](https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/336) remains a
draft. The already-enabled local flag is evidence of installed state, not evidence
that the required gates have been satisfied. This investigation does not toggle it.

Before promotion, the owner/Trading Lab must record the exact approved contract,
single demo profile, symbols/size, schedule and authorized operator for a controlled
paper run. Reconcile the overlap with #336; do not merge both overlapping adapter
implementations blindly. Review the implemented ingress durability change and collect
new handler/maintenance traces before calling the initiating causes established.

For controlled Windows deployment: inventory and hash every installed file again;
stop the designated bridge under the approved rollout procedure (its autoreloader
makes editing a running file unsafe); back up code/config/journal/outbox separately;
apply only reviewed adapter and policy deltas; preserve local core/autostart
customizations; verify installed hashes and effective child-process configuration;
start the exact intended entrypoint. Do not enable a new broker scheduler without
the #335 gate. A Render LIVE deployment proves none of these Windows steps.

Paper acceptance must capture signal receipt/save, each state transition, target
cancel acknowledgement, exact order identity, executions, broker-flat position,
all-client order cleanup and journal/publication reconciliation for the approved
single profile. Exercise cancellation races, restart/disconnect, half-day/session
boundaries and duplicates under a controlled test plan. No residual owned or
foreign orders may be left by the test. Existing external holdings/orders must not
be canceled to manufacture a clean result. Until that evidence exists, this remains
a draft engineering candidate and the incident remains open.

Rollback: stop the candidate before file restoration, restore the backed-up code
and policy for the verified baseline, and reconcile current broker evidence before
restarting. Do not roll back the journal/outbox over newly executed orders or
reactivate stale intents. Preserve incident records and quarantine. No production
change was made by this PR preparation, so no immediate rollback is needed.
