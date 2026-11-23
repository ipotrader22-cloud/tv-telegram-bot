# Shrek GOOGL duplicate exit — November 20, 2026

The paper broker's seven-day execution view showed this sequence (New York time):

| Time | Action | Shares | Price | Interpretation |
| --- | --- | --- | --- | --- |
| 14:00:15 | SELL | 110 | 272.94 | Shrek short entry |
| 15:55:31 | BUY | 110 | 264.545 | EOD close |
| 15:55:40 | BUY | 110 | 265.62 | Reopened long, matching the stored target price |

The local Shrek EOD record confirmed flat at 15:55:32 and recorded callback
delivery at 15:55:39. Its managed row had already been cleared when the second
buy filled. The stored strategy/profile was `SHREK_1_4` / `GOOGL_15`; the SMIO
journals did not attribute this position to SMIO. The timing and exact target
price support an uncancelled target racing the EOD close. The UI history and
local journal establish the duplicate buy; the subsequent API's limited
execution-history window does not independently establish Friday's order IDs.

The owner manually closed the unintended long. A read-only broker audit at
06:55 ET on November 23 confirmed GOOGL position zero and no working GOOGL
orders. The original short was genuinely closed; its existing strategy close
must not be rewritten to include the accidental long's later manual exit.
No ledger correction or synthetic callback is part of this repair.

## Failure path and repair

The old Shrek EOD helper cancelled targets found in the local trade cache and
treated an empty cache as proof cancellation had completed. It also accepted
cached flatness after the EOD order, allowing publication and managed-row
clearance while a target could remain at the broker. The close reservation
was recorded as not submitted immediately before `placeOrder`, leaving a
restart gap.

The repair requires fresh broker evidence, exact target identity, terminal
cancellation acknowledgement, and a signed remaining position matching the
original quantity less exact target executions. It persists target identity
before cancel and a submission reservation before the market close. Ambiguous
retries observe broker state without placing another close. Full target fills
need no EOD market order; partial target fills reduce it. Flatness alone cannot
create an execution or a public close. Final close publication uses exact
execution components, weighted price, fresh flatness and no working orders.

The configured local EOD time (15:55), signals, target, stop, sizing policy,
regular-session policy, SMIO and futures systems are unchanged.

## Validation and rollout

- Isolated Edge/Shrek regression suite: 143 tests passed.
- Isolated SMIO regression suite: 104 tests passed.
- New broker-response cases include an empty local cache, pending cancellation,
  missing completed-order acknowledgement, target fills during cancellation,
  partial fills and stale positions, foreign identities/accounts/clients,
  delayed execution details, reappearing targets, crash reservations, persistent
  identity recovery, completed replies without client-local IDs/quantities,
  existing close references, dry run, session rollover and disk-write failure.
- Tests mock all broker mutations. No real or paper test orders were submitted.
- Before installing, confirm the stock bridge is stopped, compare installed
  source against main, back up the installed core, and install only the core.
  Verify syntax and exact source hash. Preserve normal startup and all journals.
- Observe the next normal bridge startup and actual scheduled close separately;
  unit tests and an offline installation do not prove a live broker lifecycle.
- Rollback: restore the dated local core backup while the bridge is stopped,
  revert the PR through normal deployment, and retain all execution journals.

Missing/ambiguous broker history deliberately blocks automated closure. Inspect
the broker and manage any residual position manually before reconciling state;
never clear reservations merely to force a retry.
