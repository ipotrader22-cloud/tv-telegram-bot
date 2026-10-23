# Engine 2.0 shadow — historical parity evidence register

Audit observed: 2026-10-17, shadow deployment `dep-db9u7frrjlhs7386gq70`, commit `7f5e9206ac73867a4463c9d0d084c720f2ccd52e`.
Source as-of: 2026-10-16. **Shadow only; not a production certification.**

## Verified gates
- Historical realized P&L replay: PASS.
- Frozen equity formula errors reported: 0.
- Live Sheet versus imported snapshot: PARTIAL (no detected closed-lot, active-position, or frozen-equity drift).
- Historical frozen membership certification: PARTIAL.

## Unverified membership dates
All listed dates have gate `INTRADAY_MEMBERSHIP_TIMING_NOT_RECONSTRUCTIBLE`:
- 2026-08-21
- 2026-09-03, 2026-09-04
- 2026-09-21, 2026-09-22, 2026-09-23, 2026-09-24, 2026-09-25, 2026-09-28, 2026-09-29
- 2026-10-01, 2026-10-02, 2026-10-05, 2026-10-06, 2026-10-07, 2026-10-08, 2026-10-12, 2026-10-16

## Evidence required to resolve
For each flagged date, locate timestamped opening/closing evidence and the frozen equity mark's exact cutoff time, with timezone and lot identity. Acceptable sources could include contemporaneous broker executions, append-only signal logs, or timestamped archived snapshots **if they exist and can be reconciled**. A date-only trade record cannot prove intraday membership. Do not invent timestamps, backfill event chronology, or promote PARTIAL to PASS without independent evidence.

## Next verification gates
1. Inventory available timestamped evidence for each flagged date.
2. Cross-check lot identity and mark cutoff against historical events.
3. Keep unresolved dates explicitly PARTIAL; record exact supporting source for any certified date.
4. Re-run shadow tests and replay after any evidence-only improvements.
5. Keep production and the canonical Google Sheet unchanged. Do not merge shadow branch for production cutover based on this report.

Shadow PostgreSQL free-instance expiry previously reported for 2026-11-15; plan retention or migration before that date, without weakening the external IP allowlist.
