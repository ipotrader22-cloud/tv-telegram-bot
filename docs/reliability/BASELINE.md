# VIXALE Engine 2 reliability evidence inventory — 2026-11-03

Scope: isolated read-only observations and proposed development CI. This is **not** a staging certification or cutover authorization. Direct sources: GitHub PR and Actions API, repository ADRs, and Render workspace/service/deploy inventory read on November 3, 2026. No environment values or private workbook data were retrieved.

## GitHub baseline

- Repository: ipotrader22-cloud/tv-telegram-bot; main is the default branch.
- Engine 2 draft PR: https://github.com/ipotrader22-cloud/tv-telegram-bot/pull/329
- PR #329 is OPEN, DRAFT and UNMERGED into main.
- At inspection, PR #329 head was 7a9e92d6078b1abb91cb64d1e9eed2e7908c5081 on engine-v2-shadow-foundation-20261016.
- Exact SHA Actions query returned total_count=0: https://api.github.com/repos/ipotrader22-cloud/tv-telegram-bot/actions/runs?head_sha=7a9e92d6078b1abb91cb64d1e9eed2e7908c5081
- The existing Engine 2 Shadow Tests workflow is filtered to engine-v2/** and its own workflow file. The existing external parity workflow is also narrowly filtered. A documentation-only commit can have no direct CI run.
- Earlier passing runs are **historical**, not current-head evidence. Exact-head code CI is therefore **UNVERIFIED**, not FAIL and not PASS.
- Re-read PR #329 and its commit before future branch operations: another Engineering owner can update it.

## Direct Render read-only inventory

Workspace: Trader's workspace (tea-d86vflpkh4rs73f3t7n0). Both isolated services track engine-v2-shadow-foundation-20261016 and have auto-deploy **off**.

| Service | ID | Observed LIVE deploy | Deployed SHA |
| --- | --- | --- | --- |
| Single permitted staging cron writer | crn-dbdknsl9fdbs73bfloi0 | dep-dbkioll9fdbs73behsn0 | a04d60ba9cb9ab5bbe2dee5394a8489d23640578 |
| Read-only shadow observer | srv-db9bm0m7bikc73fece8g | dep-dbkiqiijnfac7391te70 | 7a9e92d6078b1abb91cb64d1e9eed2e7908c5081 |

These are **different revisions**. Whether this is an intended compatible combination is **UNVERIFIED**. A Render LIVE deploy alone does not certify successful cron execution, database parity or email delivery. This inventory did not trigger any deployment.

## Model-price policy evidence conflict

The November 3 handover describes DELAYED_0940_MODEL_V1 and an exact one-minute bar ending at 09:40 ET. However, docs/ADR_ENGINE2_GOOGLE_MORNING_QUOTES.md documents the owner's October 29 isolated-staging approval of GOOGLE_LATEST_1000_MODEL_V1. That mode uses the latest valid timestamped same-session RTH Google quote available at the 10:00 review, with a maximum 20-minute age. The legacy 09:40 rule and Google latest mode are **not interchangeable**.

The immutable price_policy of each actual recorded financial session controls its verification. Do not overwrite historic records, silently normalize timestamps, or assert all sessions are exactly 09:40. Authoritative cron configuration and per-session source policy remain unverified in this read-only inventory.

## Independent gates still UNVERIFIED

- Real pre-open preparation, sourced carried-lot current-session 09:30 opening, and actual 10:00 decision timestamps on November 3.
- PostgreSQL ledger ownership/uniqueness, restart idempotency and cash/equity reconciliation.
- Private staging workbook identity, formulas and immutable Closed/Equity History row parity.
- Shadow API plus exact uncached HTML fingerprint, positions, valuation and session parity.
- Resend restricted recipient, provider message ID, accepted versus delivered, dedup and absence of unauthorized delivery. No email was sent in this task.

## Scope, security, and controls

The staging cron is the only authorized Engine 2 PostgreSQL publication/outbox writer; observer and auditor may only read. No broker orders, TWS/local bridge/Pine changes, strategy adjustments, legacy workbook writes, customer email, site changes or production deploy. PR #329 is not to be overwritten. No secrets or private data are included in the evidence artifact.

The proposed Engine 2 Exact Head Certification workflow checks every PR revision (including docs-only changes), checks out the **head** commit explicitly, exercises isolated PostgreSQL and regression tests, and records source identity. Its produced certificate only establishes checkout identity; the actual completed GitHub workflow result is a separate gate. It does not certify live staging.

## Rollback and next verification

Rollback is to close the separate reliability PR or revert only its CI/docs changes. No staging or production resource was changed. Before any future staging alignment, independently inspect matching cron/observer source revisions, current market-session evidence and all relevant provider readbacks. CUTOVER: NOT AUTHORIZED.
