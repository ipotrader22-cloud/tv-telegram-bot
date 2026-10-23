# SMIO stale ENTRY_FILL publication prevention (2026-10-23)

October 22 COP SMIO BUY 693 closed by SMIO at 15:55 ET. Bridge restart
broke prior-day execution-history continuity; its delayed entry callback was
delivered on October 23 at 08:00 ET, recreating a false OPEN.

## Publication-only safety fix

- Same-New-York-day SMIO `ENTRY_FILL` callbacks use the existing callback path.
- Prior-day or missing/unproven signal timestamp requires exact broker revalidation
  under the existing IB lock: matching journal setup and entry order identity,
  uninterrupted execution-history/foreign ownership proof, full retained entry
  fills, zero exit/target fills, broker position of exactly the expected signed
  quantity, and only the exact matching working target.
- A valid broker-proven overnight OPEN is eligible to publish, even on the next
  calendar day. Date by itself does not suppress it.
- Failed or unavailable proofs return an explicit `quarantine` outcome.
  `attempt_render_outbox_delivery` persists `quarantined: true` and then
  skips further automatic and forced delivery attempts. The original payload
  and last reason remain available in the durable outbox. If persistence fails,
  the delivery is reported as a failure rather than claiming quarantine.
- No automatic replay/unquarantine: human investigation is required. A
  *legitimate* overnight order after process restart can be quarantined if
  continuous execution history cannot be established; it must not be
  misrepresented as closed or silently dropped.
- Exit callbacks and other strategies do not use the guard.

No strategy calculation, order placement/cancellation, execution-history safety
gate override, COP recovery, or Telegram backfill is included.

## Deployment verification needed

Run Python unit and bridge outbox integration tests; inspect the full diff;
confirm the production Windows `C:\\ib_bridge` installation matches the
reviewed GitHub code (a Render deploy does not update Windows); simulate
same-day, overnight with complete history, overnight after restart,
already-flat, mismatched order identity, outage, forced retry, and restart.
Verify pending outbox quarantine persists and does not flood logs.
