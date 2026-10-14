# VIXALE secure execution migration — deployment gate

Status: PROPOSED / NOT DEPLOYED. No strategy changes, trading writes, or emails are authorized by this file.

## Secrets (repository Actions secrets, never source-controlled)
- `VIXALE_GOOGLE_SERVICE_ACCOUNT_JSON`: dedicated Google service-account JSON, scoped to the canonical workbook via explicit sharing; use minimal access.
- `VIXALE_RESEND_API_KEY`: restricted Resend key for alerts@vixale.com.
- Any deployment token required by the existing publication workflow must be provisioned separately; do not assume one exists.

## Mandatory implementation acceptance criteria
1. Read Operational Control FINAL (2026-10-12) and consolidated FINAL Source of Truth before coding. Treat historical portfolio snapshots as historical.
2. Implement independent 09:30, 10:00, 10:25 and :40 writer windows with NYSE calendar and America/New_York DST checks. Do not change or disable existing cloud jobs until replacement is validated and explicitly coordinated; concurrent writers must honor the same lock.
3. 10:00 engine must obtain validated completed-session OHLCV, contemporaneous RTH prices, independently sourced news, nine-factor evidence totaling 100, and exact matching live workbook membership. No invented factor scores.
4. Every mutation uses Google Sheets native batchUpdate with developerMetadata lease ID 1030100 and fence ID 1030101, exact key/value conditional delete/recreate and all financial requests in ONE atomic batch; readback after uncertain outcomes.
5. Preserve original entries and entry scores, immutable Closed Trades, Q/R inclusion/effective-date rules, fixed-$10K model P&L, Public Feed spill/cash formulas, Equity History C/E/F formulas and stored numeric historical D.
6. Validate post-change uncached production HTML/API parity and current full-review gate before morning Resend. Deduplicate full-date history by recipient, subject/event, canonical idempotency key; accepted != delivered.
7. No broker orders; no automatic X; no Gmail fallback. Never print credentials in logs.
8. Test lease conflict rollback, late-run read-only, partial-data failure, no duplicate trades, exactly one equity row, missing-publication withheld email, Resend delivered dedup, retries and DST/holiday behavior before merge.
9. Deployment requires a reviewed PR and successful end-to-end staging verification. Do not claim production success based on workflow YAML alone.

## Rollout
Phase A: read-only preflight with sanitized diagnostics and explicit missing-secret signals.
Phase B: staging dry-run against nonproduction sheet and test mail recipient.
Phase C: production cutover in a coordinated writer window, with live readback and publication/email verification.
