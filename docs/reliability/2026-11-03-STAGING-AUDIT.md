# Engine 2 staging read-only audit — 2026-11-03, pre-market

**Status: FAIL (pre-open stage); independent downstream provider gates UNVERIFIED. CUTOVER NOT AUTHORIZED.**
Observations through connected GitHub, Render and private Google Sheets. No credentials, workbook rows, customer data or email content recorded.

## Direct evidence

- PR #329: OPEN / DRAFT / UNMERGED, SHA 7a9e92d6078b1abb91cb64d1e9eed2e7908c5081. Exact-head GitHub Actions query returned zero runs.
- Reliability PR #352 at SHA a14bf63e03722574dc8a47009a538f4c4343af5c: [shadow CI](https://github.com/ipotrader22-cloud/tv-telegram-bot/actions/runs/41618605809) and [exact-head certification](https://github.com/ipotrader22-cloud/tv-telegram-bot/actions/runs/41618606007) SUCCESS, with 425 shadow tests and 11 reliability tests. These are only code checks for PR #352.
- Render: cron crn-dbdknsl9fdbs73bfloi0 LIVE deployed at a04d60ba9cb9ab5bbe2dee5394a8489d23640578; observer srv-db9bm0m7bikc73fece8g LIVE deployed at 7a9e92d6078b1abb91cb64d1e9eed2e7908c5081. Auto-deploy disabled on both. The revision mismatch is confirmed; compatibility UNVERIFIED.
- Render cron app logs: repeated sanitized BLOCKED/PREOPEN_PREPARATION_FAILED/exitCode=1 between 12:02 and 12:08 UTC (07:02–07:08 EST) on November 3. The source collapses underlying exceptions to a generic stage code; no specific provider root cause is established.
- Private native workbook VIXALE Engine 2.0 — CLEAN SLATE STAGING (NOT LIVE): America/New_York timezone; Portfolio, Open Positions, Closed Trades, Public Feed, Equity History, Engine 2 Quotes tabs present. Bounded Public Feed read shows 2026-11-02 at 10:00 ET. Equity History and Engine 2 Quotes contain example formulas; this is not full formula protection or financial parity verification.
- Staging PostgreSQL dpg-db9bi48m7kps73coucq0-a: direct read-only query blocked by empty external IP allowlist. Do not open the database or copy credentials. Ledger and idempotency UNVERIFIED.
- Uncached external shadow /health, /v2/model/snapshot and /v2/swing-trading could not be independently read through the external text fetcher; not evidence of an application error. API/HTML parity UNVERIFIED.
- The Resend connector returned dashboard-health test deliveries, a separate product; these must not be conflated with Engine 2 staging mail. Engine 2 provider delivery and allowlist readback UNVERIFIED.

## Gate verdicts

| Gate | Status | Source |
| --- | --- | --- |
| PR #352 exact-head CI | PASS | Two successful GitHub workflow runs |
| Render same-SHA revision parity | FAIL | Deployed cron and observer SHAs differ |
| Nov 3 preopen preparation | FAIL | Repeated Render BLOCKED exit 1 |
| Nov 3 09:30 opening / 10:00 review | UNVERIFIED | No completed source-backed review at inspection |
| PostgreSQL uniqueness/accounting | UNVERIFIED | Read-only connection restricted |
| Private Sheet tab membership/timezone | PASS (partial) | Direct metadata; formulas and accounting unverified |
| API vs exact uncached HTML | UNVERIFIED | External readback unavailable |
| Resend private Engine 2 delivery | UNVERIFIED | No exact provider identity/readback |

Price policy: the approved October 29 GOOGLE_LATEST_1000_MODEL_V1 is distinct from DELAYED_0940_MODEL_V1. Respect immutable policy of each session. Do not substitute values to force a pass.

The operational diagnostic gap is preopen exception classification. A separate read-only/sanitized category mapping can narrow the cause without changing research, finance, orders, or publication behavior. No staging/production writes, deployments, mail or manual replays were performed. Cutover remains prohibited.
