# SMIO durable receipt and broker execution boundary

Status: candidate in PR #349. No installed Windows change is implied.

## Problem and decision

The shared bridge `/tv` route acknowledged a SMIO signal before its background
handler durably saved any record. Render could mark the delivery COMPLETE while
a process interruption lost the accepted work. The broker lifecycle journal
cannot close this gap because it is reached only after asynchronous broker reads.

Install a SMIO-only receipt hook before the existing HTTP acknowledgement.
Persist validated event identity, body fingerprint, effective dry-run, original
payload, receipt timestamp and process ownership in `smio_demo_inbox.json` using
flush/fsync/atomic replacement. The single bridge process owns this journal.
No broker connection or mutation occurs during receipt acceptance. Other
strategies keep their original route and payload behavior.

HTTP 200 `smio_durably_received` means durable receipt only, never an order or
fill. Storage failure/corruption returns 503; invalid new input returns 400;
same event with different execution body or dry-run returns 409. Render transport
timestamps do not change event identity. An exact completed duplicate remains
acknowledgeable after expiry but cannot execute again.

## State machine and recovery

`RECEIVED -> PROCESSING -> HANDLED` records every dispatch/result. A claim is
durable before entering the existing broker lifecycle. Background delivery and
maintenance drain the same receipt, so they cannot independently submit it twice.
If the background task is lost in the same process, maintenance picks up RECEIVED
work. A transient blocked result without an existing lifecycle event may RETRY
after five seconds, at most three attempts and only within 90 seconds of receipt.
Existing contract validation is repeated before each claim. The retry window is
an ingress recovery limit, not a change to Pine signal generation or strategy
parameters. Once the broker lifecycle owns the event, its existing exact ownership
and reserved-order recovery owns subsequent actions.

An unfinished receipt from another process is QUARANTINED. An expired unprocessed
receipt is also QUARANTINED. Neither is automatically replayed, even if a matching
symbol is visible at the broker. A PROCESSING receipt whose result save failed is
left claimed; its lifecycle journal and broker evidence govern recovery. Preserve
these records for operator review. There is deliberately no replay endpoint.
New prior-day signals are rejected; this does not rewrite historical journal
records or release the #341 quarantine.

## Maintenance and evidence

Ingress, reconciliation and EOD have independent phase error handling. Individual
reconciliation rows are also isolated: an ambiguous historical row cannot suppress
another owned position. All mutations still use the existing routing and broker
locks, exact account, order, execution and session gates.

The existing demo-status endpoint includes aggregate receipt-state counts without
payloads or account identifiers. The read-only audit joins receipt timestamps and
states by exact event ID; a missing old inbox yields unknown values. Inbox
QUARANTINED/PROCESSING counts and blocked results need operational review, not
automatic reset. Diagnostics do not promise that a durable receipt was executed.

## Validation and rollout

Tests exercise the actual `/tv` function with isolated dependencies: fsync/save
failure before ACK, corrupted inbox, foreign-route preservation, concurrent
duplicates, body/dry-run conflicts, expired duplicates, omitted background work,
restart quarantine, transient disconnect retry, failed result persistence and
prior-day rejection. Shared-connection fixtures also close two owned symbols once
each and isolate an invalid historical row.

Deploy the reviewed core route hunk, adapter, ingress helper and policy together;
do not replace locally customized core/entrypoint/autostart files wholesale.
Back up the receipt journal with lifecycle/outbox data on later deployments.
Rollback must stop the candidate first and preserve the receipt journal: reverting
the route removes durable ACK semantics and must be reported as such. Never reset
receipt states or restore older broker journals to force a retry.

This architecture closes the identified acknowledgement/persistence gap. It does
not recreate missing October 26 logs, establish NKE's original failure, establish
the missed failsafe's exact cause, or satisfy #335 paper activation gates.
