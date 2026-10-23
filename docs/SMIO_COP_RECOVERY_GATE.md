# SMIO prior-day close recovery proof gate (draft)

The October 22 COP SMIO entry (693 shares, order ref `SMIOE_6be0f6ecfe0dcc70bd58`) and exit
(order ref `SMIOC_6be0f6ecfe0dcc70bd58_0`) are retained in the local journal.
The journal reports `bridge_process_changed_after_signal` and remains
`CLOSE_PENDING`; no exit callback was created. Render's entry was delayed by a
period of ngrok unavailability. The stale Open Positions row has been removed,
but the executed exit has not been published into historical results.

This PR introduces only a standalone, read-only candidate proof predicate.
It is deliberately **not wired to the bridge**, cannot send a callback and cannot
relax `execution_history_coverage_metadata`.

Before any later recovery/publisher PR:
- Prove exact account/order ownership and complete history across process restart
  with independent IB Flex/statement or other independently authoritative history.
- Confirm 693 entry and 693 exit fills, four close exec IDs, zero target/foreign
  executions, zero working orders and broker flat for the same account.
- Reconcile any retired orders, partial fills and duplicate callbacks.
- Introduce a persisted, idempotent operator approval/outbox recovery path,
  without placing/cancelling broker orders or automatically sending Telegram.
- Test restart and duplicate submissions and verify historical Sheets write.
- Verify the installed Windows bridge source; merging GitHub alone is not a bridge deployment.

No COP historical CLOSE or P&L is synthesized by this PR.
