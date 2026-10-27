# SMIO controlled Windows rollout and paper acceptance

Status: prepared, not authorized/activated by this document. This plan is the
concrete next step after PR #349 offline/CI validation, subject to Issue #335's
supervised paper gate. Engineering preparation does not certify a research freeze.

## Proposed existing profile

- TWS Simulated Trading; exact account must match the private attested config.
- Symbol NKE; timeframe 60 minutes; ATR target mode.
- Experimental contract `SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013`.
- Existing configuration `PINE01:118:23:15:2:true:true:8:21:200:ATR:2.9:Auto:true`.
- Preserve current TradingView Strategy Properties sizing and exact positive
  whole-share payload quantity. No synthetic order, invented signal, one-share
  override, parameter change or historical event replay.
- EOD due five minutes before the actual broker-verified session close. A regular
  16:00 close yields 15:55; a verified 13:00 close yields 12:55. Unknown/holiday
  schedules fail closed. Verify the actual next session at test time.

This profile was read from the installed journal, not invented from a fixture.
Its current UAM source/settings and account attestation must be reverified before
use. The paper run needs a fresh legitimate strategy entry; if none occurs, the
run is inconclusive. Do not fabricate an entry to finish a checklist.

## Supervised rollout

1. Owner/Trading Lab records approval of this exact experimental-demo scope and
   names the supervising operator/test session. Resolve draft #336 overlap.
2. Operator isolates SMIO to this one test profile and pauses its alerts during
   installation. Do not alter other strategies or cancel their orders. Choose a
   maintenance slot where stopping the shared bridge is safe for other systems.
3. Re-read broker positions, executions and all-client orders. Require NKE flat
   with no NKE working orders; retain external SBUX/ES orders and history. If the
   facts changed, stop and revise the plan rather than flattening unrelated holdings.
4. Stop the exact bridge/reloader under operator control. Its auto-reload makes
   in-place edits while running unsafe. Capture backups and hashes locally for
   core, adapter, policy, config, lifecycle journal, receipt journal and outbox.
   Backups containing account/config values must stay private on that machine.
5. Compare the prepared manifest with current files. Deploy only the reviewed
   core route insertion, adapter, ingress helper, policy and optional audit.
   Preserve the existing entrypoint, autostart and unrelated local customizations.
   Any unexpected hash difference requires a new diff, not a forced copy.
6. Start with SMIO EOD activation held off in the effective child environment
   until account/session/status checks pass and the operator begins the approved
   test. This requires explicit authorization: the current autostart injects ON.
   Do not infer the effective value from `.env` or a different shell.
7. Verify installed hashes, exact entrypoint, connected demo account, journal and
   outbox retention, receipt/status health and broker liquidHours. Do not migrate
   or automatically replay historical intents/receipts. Existing ownership-lost
   and disputed historical setups stay reserved/quarantined for review.

## Broker-confirmed paper acceptance

1. Operator enables only the approved profile and test failsafe for the agreed
   session after the checks above. Retain trace capture for the running process.
2. Capture a fresh natural entry's exact setup/event ID, HTTP receipt persistence,
   handler start, broker entry/target IDs, execution IDs and confirmed quantity.
3. Capture the legitimate CLOSE or broker five-minute EOD intent. Verify exact
   target cancellation/terminal acknowledgement, post-cancel position and execution
   ownership proof, one market-close order, and actual executions for all shares.
4. Independently query all-client orders and broker positions. NKE must be flat
   with no residual owned order and no new unintended foreign order. Existing
   unrelated orders are compared with baseline, not canceled for a clean display.
5. Verify journal exact executions/terminal reconciliation and the execution-first
   Render callback/ledger. HTTP 200, submitted order or a dashboard label alone
   cannot pass. An outbox delay must not halt residual execution recovery.
6. Re-deliver only an exact already-completed test event under the supervised test
   authorization and confirm no new order. Disconnection/restart and cancellation
   races remain offline-proven until explicitly controlled paper cases are run;
   do not interrupt a shared production bridge merely to induce a failure.
7. Record pass/fail evidence and the owner decision on continued activation. If
   the profile has no open position at EOD because a legitimate target/stop already
   closed it, the EOD execution case is unproven and needs another natural case.

## Stop and rollback

Stop the test on ambiguous ownership, account mismatch, missing execution coverage,
unexpected order, session uncertainty or residual quantity. Preserve evidence and
let the supervising operator decide recovery; do not submit an extra close.
Stop the candidate before restoring backed-up code/policy. Keep all new journal,
receipt and outbox evidence. Never restore old state over fills, force replay,
clear historical quarantine or cancel foreign orders. Reverting the core route
also reverts durable receipt semantics and must be reported.
