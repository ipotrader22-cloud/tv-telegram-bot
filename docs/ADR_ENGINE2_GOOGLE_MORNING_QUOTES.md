# ADR: Latest timestamped Google quotes for the 10:00 ET staging review

Status: owner approved 2026-10-29. Applies only to PR #329 isolated staging.

The owner explicitly accepts the latest timestamped Google quote available at
the morning review rather than the exact Yahoo minute ending 09:40 ET.
TWS remains dedicated to VECO day trading. No bridge or trading changes.

Use GOOGLE_LATEST_1000_MODEL_V1 with the existing pre-open frozen research,
exits-first fixed-$10K accounting, immutable prior-state/preparation checks and
10:00–10:05 new-decision window. Prior persisted artifacts keep their own policy.

Read resolved GOOGLEFINANCE price, tradetime, datadelay and session volume from
Engine 2 Quotes A1:F11 in the private staging workbook. Verify workbook,
timezone, tab ID and formulas. A same-session regular-hours source timestamp,
positive price/volume and source age <=20 minutes are mandatory. A reported
delay of zero never overrides an old trade timestamp. No interpolation,
previous close, fabricated minute volume or fabricated 09:40 timestamp.

Persist the actual source values/hash, per-stock timestamp, fetch time and
decision time. The oldest source time is the conservative run reference.
Different stock timestamps are allowed; retries may read newer quotes only
before an immutable financial commit. Replays use its retained artifact.
Public Google labels describe indicative model quotes, never broker fills.

The new quote source does not replace prior-session historical research or
trigger scanning, which still depend on Yahoo and remain separately gated.
No production promotion, legacy workbook change, customer email or scheduler
change. Require passing exact-head GitHub CI including PostgreSQL before
manual isolated deployment. Staging email remains NO.

Rollback: restore DELAYED_0940_MODEL_V1 and deploy the prior tested staging
head. Preserve source evidence, prior runs and financial history. Never reset
the ledger or reprice a committed session.
