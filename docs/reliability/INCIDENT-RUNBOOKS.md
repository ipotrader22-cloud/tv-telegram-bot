# Engine 2 reliability incident runbooks — isolated, read-only

This file records reproducible diagnostic cases. No live research, broker activity, database write, Google Sheet edit, Render deploy, production schedule change, or Resend send is authorized by these instructions. Use actual source-backed observations to identify a live incident; passing fixture tests alone is not a provider repair.

## Incident A — Yahoo minute live tail / missing exact historical bar

**Symptom:** fixed 09:40 minute-reference lookup fails even when the provider returned a positive current quote. An in-progress minute may have incomplete OHLCV or zero volume; the 09:40-start bar must never replace the completed 09:39–09:40 bar. A 10:04 retry must not drift the fixed cutoff.

**Scope/authority:** staging historical/fixed-price adapter, not Trading Lab scoring. In GOOGLE_LATEST_1000_MODEL_V1 the morning Google source uses its own validated timestamps and age rule; Yahoo still powers separate prior-session research/trigger collection. Do not treat a Yahoo gap as permission to switch to an unapproved fallback.

**Reproduce offline:** run node --test engine-v2/yahoo-minute-fallback.test.cjs and node --test engine-v2/delayed-model.test.cjs. These cover zero-volume live-tail exclusion, null current-minute slot, conflicting duplicate timestamps, incomplete vectors, exact 09:40 policy and source freshness.

**Safe diagnosis:** inspect sanctioned fixed-coded source state (missing bar, wrong interval, stale provider, incomplete vectors) and source timestamp/hash, not raw headers or full private response. A genuine source gap blocks the cycle without fabricating a price or shifting source time. Never publish stale portfolio data as refreshed.

**Rollback:** revert only an isolated adapter change if a code regression was introduced; preserve committed research and ledger. **Regression success:** fault-injection inputs fail closed; valid completed exact bar passes.

## Incident B — Staging Sheets/API/HTML parity and cold start

**Symptom:** an API snapshot differs from the independently rendered HTML, no-store is missing, or a warming/sleeping observer returns transient 429/503. This is not evidence to modify model positions or resend mail.

**Reproduce offline:** node --test engine-v2/staging-external-parity.test.cjs and node --test engine-v2/direct-html-api-verifier.test.cjs. Cases include bounded retry of transient HTTP, permanent rejection of 403 and wrong host, cache-policy mismatch, altered HTML, and invalid snapshot date.

**Safe diagnosis:** read-only GET /health, /v2/model/snapshot, /v2/swing-trading from the explicitly authorized isolated observer; compare source snapshot ID/date, read-only mode and exact HTML. Never fetch a production endpoint as fallback; never send a customer email from audit. A provider/network error remains UNVERIFIED until authoritative readback.

**Rollback:** revert only an isolated verifier improvement; financial history, sheet rows and API publication journal remain immutable.

## Incident C — PostgreSQL staging lease / duplicate ledger

**Symptom:** more than one run, event, lot, outbox item, or mismatched financial aggregate appears for a single session.

**Reproduce offline:** node --test engine-v2/staging-db-integrity.test.cjs and node --test engine-v2/staging-pipeline-pg.integration.test.cjs (the latter requires disposable PostgreSQL configured as in Engine 2 Shadow Tests CI). Confirm separate cron writer, observer read-only, read-only transaction, unique event IDs, correct model equity and immutable session journal.

**Safe diagnosis:** read aggregate counts only from authorized staging DB. Do not add external IP access, reset history, remove rows or replay the cron to obtain a green result. On conflict mark FAIL; on denied database access mark UNVERIFIED.

## Incident D — Resend accepted is not delivered

**Symptom:** API provider accepted a staging request but no delivery event is independently verified, or a bounced / mismatched-recipient message is observed.

**Reproduce offline:** node --test engine-v2/resend-provider-readback.test.cjs and node --test engine-v2/resend-review-outbox.test.cjs. Cases must reject wrong recipient, subject, body, provider ID and duplicate/outbox identity.

**Safe diagnosis:** match only authorized isolated cron idempotency key, message ID, sender, exact allowlisted recipient, [STAGING — NOT LIVE] subject and provider status. A test from the separate website-health service is **not** Engine 2 evidence. Accepted-not-delivered is UNVERIFIED; bounce, unauthorized recipient or identity mismatch is FAIL. No audit-induced send or replay.

## Incident E — Nov 3 repeated preopen failures: diagnosis still incomplete

**Observed:** Render cron logs on 2026-11-03 12:02–12:08 UTC repeatedly reported BLOCKED / PREOPEN_PREPARATION_FAILED / exitCode=1. Current staging-cron catches any exception during the pre-open stage and emits that generic reason; exact provider exception is intentionally hidden. It is not proven to be a Yahoo, Sheets, research, database or calendar failure.

**Safe sequence:** check deployed SHA, confirm preopen clock/session, inspect only fixed non-secret stage categories, compare existing immutable preparation and prior ledger if reachable through authorized read-only access. Classify a source outage, evidence gap, conflict or permission problem only with direct proof. Never weaken readiness gates or insert fabricated preparation. Any diagnostic code patch must retain the same throw/fail policy and add fixed-code negative tests that prove no raw exception leakage.

## Common failure labels

- FAIL: direct source or explicit negative evidence contradicts the required gate.
- UNVERIFIED: no sufficiently direct identity/timestamp/source or denied external read.
- PASS: direct authenticated evidence satisfies the exact gate. Offline fixtures alone cannot establish production or staging PASS.
- CODE TEST PASS / STAGING PUBLICATION PASS / PROVIDER ACCEPTED / PROVIDER DELIVERED are distinct.

Cutover remains NOT AUTHORIZED.
