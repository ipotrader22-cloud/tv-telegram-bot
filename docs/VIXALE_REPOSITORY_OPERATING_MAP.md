# VIXALE repository operating map

Audited November 24, 2026. This is an implementation/evidence index for
[`AGENTS.md`](../AGENTS.md), not a strategy amendment or deployment authorization.
Re-read live state before mutations; the observations below are dated.

## Branch applicability and November 24 synchronization

This copy applies to `engine-v2-ibkr-market-data` (Isolated IBKR authorization probe).
It synchronizes the instructions reviewed at PR #431 head
`41ddac7a8fff9f4d6482f21660de0c4b9db66062`, merged into website main as
`6085cf1e4008a5d90fd786c429708216cd90db0b`. The branch's pre-sync head is
`57ca530313a6aa597cd7d5ee1ac75a101f213c2d`. Its existing handbook and all non-documentation
Git blobs are preserved; no application commits are merged across branches.

The website-only implementation and workflow entries below refer to the pinned
website main revision in the audit table. Use this branch's own Engine 2 modules,
ADRs, handbook and workflows for its behavior. Website rollout links point to
main because that release record is absent here. The IBKR branch's standalone
authorization probe remains separate from the Engine 2 writer and production
quote sources; inherited engine code is not an activation instruction.

The owner subsequently authorized completing the documentation rollout through
separate PR merges into all three destination branches, superseding the original
PR-only endpoint for this rollout. Render recorded `commit_ignored` for main's
`6085cf1e4008a5d90fd786c429708216cd90db0b` merge, using `[skip render]`.
Engine writer/observer and probe auto-deploy remain off; no manual deployment,
restart or settings change is required. Verify exact destination SHAs and
unchanged runtime blobs after each merge.

## Audit scope and source precedence

Repository: `ipotrader22-cloud/tv-telegram-bot`. The audit inventoried both complete
deployment trees, their root instructions, handbooks/addenda, ADRs, historical
state records, application/preload modules, bridge/Pine/UAM boundaries, Engine 2
modules, schema, deployment YAML, scripts, test directories and Actions workflows.
Implementation inspection focused on the contracts summarized in AGENTS; this
is not a claim that every code path or historical feature branch was executed.

| Inspected source | Revision | Role |
| --- | --- | --- |
| `main` | `f60aad15e07dd1cbd26542ef497033b5ab728cba` | Website, broker webhook/publication, bridge sources, owner procedures |
| `engine-v2-shadow-foundation-20261016` | `5f7fd8392cc1263e33018bee5cb84ba6486add1d` | Engine 2 financial writer, observer, PostgreSQL, model/research tests |
| `engine-v2-ibkr-market-data` | `57ca530313a6aa597cd7d5ee1ac75a101f213c2d` | Adds only the isolated IBKR authorization-discovery module to the inspected engine tree |

Only repository-root AGENTS files were found in the audited trees. Before this
synchronization, the Engine 2 copy lacked main's October 25 Autonomy and Completion
section; that valid instruction is now included while retaining existing rules.
The project-mirror AGENTS and FINAL October 12 Source of Truth and
Operational Control were read as references and left untouched. The repository
[Active Portfolio Source of Truth](VIXALE_Active_Portfolio_Source_of_Truth.md)
contains the later November 13 prospective entry amendment.

Read the [handbook](VECO_DEVELOPER_HANDBOOK.md), relevant dated supersessions and
[Engine 2 rollout record](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/f60aad15e07dd1cbd26542ef497033b5ab728cba/docs/releases/ENGINE2_SWING_ROLLOUT.md) together. Old text
describing a prototype with no writer, public anonymous Swing access, mandatory
80-point entries, or an unactivated Engine 2 website is historical. In particular,
the engine README's prototype warning does not negate the later authorized
website connection. Neither source availability nor the word LIVE proves a
successful current-session financial review.

## Implementation verification map

Engine references below are pinned to the audited engine revision because those
paths are absent from website main. Inspect their current deployed versions for
future work rather than copying them into main.

| Contract | Implementation and verification evidence |
| --- | --- |
| Broker execution-first, exact lifecycle and strategy isolation | `app.js`; `bridge/ib_bridge_core.py`; `bridge/smi_forward_adapter.py`; `bridge/smio_demo_adapter.py`; `lib/broker-eod-callbacks.js`; Pine/UAM contracts; handbook §§3, 8–9, 13, 15 and latest Shrek/SMIO incident addenda |
| Current model entry policy, effective date and historical compatibility | [entry-allocation-policy.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/entry-allocation-policy.cjs), first-day selector, ongoing/delayed cycle, compiler and corresponding tests |
| Factor caps, stop/target/dropout and fixed allocation | [core.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/core.cjs); automated-factor-assessor, research-attestation, preopen-preparation, same-session-opening, Google opening/target providers and their tests |
| Reviewed universe and explicit unscored exclusions | [ENGINE2_INDEX_UNIVERSE.md](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/docs/ENGINE2_INDEX_UNIVERSE.md), index-universe.cjs and data/sp500-nasdaq100.json |
| Transaction/replay and single pipeline writer | [clean-ledger.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/clean-ledger.cjs), staging-pipeline-store.cjs, staging-pipeline.cjs, staging-worker.cjs, shadow-observer-writer-isolation.test.cjs |
| Atomic Sheets commit, immutable closes and formula readback | [native write-fencing ADR](ADR_SWING_NATIVE_WRITE_FENCING.md); [staging-sheets-publisher.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/staging-sheets-publisher.cjs), native-sheets-lease.cjs, staging-write-plan.cjs, typed readback/formula tests |
| True time/session gates | `scripts/swing-market-calendar.js`; [staging-cron.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/staging-cron.cjs), nyse-morning-clock.cjs, nyse-session-adapter.cjs; calendar/late-run tests |
| Independent publication and delivery proofs | [staging-pipeline.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/staging-pipeline.cjs), direct-publication-readback.cjs, direct-html-api-verifier.cjs, resend-review-outbox.cjs, resend-client.cjs and provider-readback tests |
| Evidence storage and compatible rollback | [evidence-storage.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/evidence-storage.cjs); compressed envelopes preserve hash/length validation and old plain JSONB support |
| Sanitized fault diagnosis and read-only recovery evidence | [staging-safe-reasons.cjs](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/engine-v2/staging-safe-reasons.cjs), staging-db-integrity.cjs, staging-db-monitor.cjs, startup-readonly-audit.cjs; safe SQLSTATE categories and changed-state receipts |
| Website financial source, auth and snapshots | `lib/swing-leaders.js`, `lib/swing-leaders-core.js`, `app.js`, `website_swing_canonical_refinement.js`; both source modes, owner/viewer and anonymous HTTP tests |
| Review-aware refresh, independent quote/news/history overlays | `website_swing_equity_live_refresh.js`, `website_swing_active_model_pnl.js`, `lib/swing-intraday-valuation.js`, `lib/swing-company-news.js`, `lib/swing-reporting-equity.js`; full-preload and emitted-script tests |
| Broker restart/unknown-outcome recovery | `bridge/smio_ingress.py`, `bridge/smio_stale_entry_guard.py`, `bridge/smio_eod_policy.py`, core durable reservations/outbox; SMIO/Edge/Shrek tests and incident records |

The inspected engine's session journal retains DATA, Sheet and publication
receipts separately from delivery. `BUSY`, `ACCEPTED_NOT_DELIVERED`,
`STAGING_PUBLICATION_VERIFIED_DELIVERY_LOOKUP_RESTRICTED` and email-disabled
publication can exit zero without proving a newly delivered report. The
read-only audit monitor logs changes; no universal cross-provider notification
dispatcher or exactly-on-time scheduler is established by this audit.

## Render configuration observed read-only

Workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`), confirmed by the owner.
All services below use the VIXALE repository and Oregon. Commands and branch
settings were read from Render, not inferred from old Blueprint comments.

| Service / ID | Branch; auto-deploy | Observed build / start |
| --- | --- | --- |
| Website `tv-telegram-bot` / `srv-d86vh7j7uimc73ao479g` | `main`; commit | `npm install` / `npm start` |
| Engine observer / `srv-db9bm0m7bikc73fece8g` | `engine-v2-shadow-foundation-20261016`; off | `npm install --no-save --no-package-lock pg@8` / `node engine-v2/shadow-health.cjs` |
| Engine cron / `crn-dbdknsl9fdbs73bfloi0` | same engine branch; off | same engine build / `timeout --signal=TERM 240s node engine-v2/staging-cron.cjs` |
| Engine website staging / `srv-dbn675ui0phs73857rp0` | `feature/swing-engine2-source-rollout`; off | `npm install --ignore-scripts --no-audit --no-fund` / `npm start` |
| Redesign staging / `srv-dasg3bo473hc73851jfg` | `design/work-redesign-staging-20260927`; off | `npm install` / `npm start` |
| IBKR auth probe / `srv-dc2fh66k1f9s73fr7n4g` | `engine-v2-ibkr-market-data`; off | syntax-check / run `engine-v2/ibkr-auth-discovery.cjs` |

Website: Starter, single instance, existing 10 GB disk at `/var/data`.
Observer: free, `/health`; it can cold-start and is not the scheduler.
Cron: Starter, unsuspended, `0-20 12-15 * * 1-5` UTC; actual ET/calendar and
new-decision gates are enforced in code. Staging websites and probe: free.
These facts are not permission to change plan, schedule, service or credentials.

Latest deployment records observed LIVE:

- Website: `f60aad15e07dd1cbd26542ef497033b5ab728cba`, `dep-dc2ff5h5efls73blk6s0`.
- Observer: `5f7fd8392cc1263e33018bee5cb84ba6486add1d`, `dep-dc1lc5t6e07s73dmksjg`.
- Cron: the same engine SHA, `dep-dc1lcjqvcj2c73etdsog`.
- Probe: `57ca530313a6aa597cd7d5ee1ac75a101f213c2d`, `dep-dc2fmp68bjmc73fibh8g`.

The probe code requests only `mcp.read`, holds tokens in memory, and has no order
path. A LIVE probe is not verified quote coverage, successful OAuth consent or
authorization to replace the engine's price provider. The external ES monitor
is a separate repository/service; embedding it does not change stock permissions.

Both engine Blueprint files are optional observer provisioning templates with
an existing database reference; they do not describe the active cron or website.
Never apply their initialization hook merely to refresh documentation.

## Configuration and database ownership

| Area | Names/contracts to inspect; never disclose secret values |
| --- | --- |
| Website | `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `VIXALE_SWING_SOURCE`, `SITE_BASE_URL`; existing auth, Turnstile, bridge and Resend settings in handbook §7 |
| Engine connection/identity | `VIXALE_V2_SHADOW_DATABASE_URL`, `VIXALE_V2_SHADOW_MODE`; `clean-ledger.cjs` validates `vixale_engine_v2_shadow_YYYYMMDD` and actual database identity |
| Engine research/writer | `VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON`, `VIXALE_V2_STAGING_PIPELINE_ENABLED`, `VIXALE_V2_STAGING_PRICE_POLICY`, `VIXALE_V2_RESEARCH_UNIVERSE`, `VIXALE_V2_RESEARCH_SECTORS_JSON` |
| Engine email | `VIXALE_V2_STAGING_EMAIL_ENABLED`, `VIXALE_V2_STAGING_EMAIL_TO`, `VIXALE_V2_STAGING_EMAIL_ALLOWLIST`, `VIXALE_V2_STAGING_RESEND_API_KEY`; separate single-recipient/durable-plan gate |
| Stored SQL | `engine-v2/schema.sql` plus guarded DDL in clean-ledger/pipeline/outbox modules; schema file alone is not the complete deployed schema |

The [November 8 rollout](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/f60aad15e07dd1cbd26542ef497033b5ab728cba/docs/releases/ENGINE2_SWING_ROLLOUT.md) records production
`ENGINE2` selection and reader-only financial access. Both financial ranges use
workbook `1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA`. Retained legacy workbook
is `14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc`. The older read-only audit
workbook and the dedicated website auth workbook are separate resources; do not
interchange them. Environment values, live workbook data, database contents,
current email activation and task enablement were not re-read in this docs task.

**Supabase finding:** no Supabase dependency, project configuration, migration
directory or reference was found in the two deployed source trees. The connected
Primary account listed no projects; the other connected account listed an
unrelated project, not VIXALE. No unrelated schema was inspected. The evidence
supports the repository's `pg`/Render PostgreSQL contract, not a claim about all
possible external infrastructure. Establish project identity and approved
configuration before any future Supabase action; do not provision or migrate
as part of interpreting these instructions.

## Testing and GitHub workflow map

Use the target branch's workflow for full commands, dependencies and versions.
The root package currently exposes only `start`; there is no root test script.
Do not start the real service with production credentials to run offline tests.

| Change surface | Existing checks |
| --- | --- |
| Documentation only | `git diff --check`; complete diff/file-list and reference verification; confirm all non-documentation blobs unchanged |
| App/webhooks | `node --check app.js`; `.github/workflows/app-webhook-regression.yml`, including broker evidence, durable ACK, auth and lifecycle regressions |
| Bridge/Pine/SMIO | `.github/workflows/bridge-edge-regression.yml`, `smio-stale-entry-regression.yml`; `python -B -m unittest discover -s tests -p 'test_smio*.py'` plus affected Edge/Shrek/Pine tests |
| Swing reader/valuation/auth | `swing-source-rollout.yml`: fixed-$10K precision, source switch, history, reporting anchor, valuation/news, emitted refresh and full HTTP startup with both `VIXALE_SWING_SOURCE=ENGINE2` and `LEGACY` |
| Public website | `public-website-browser.yml`: locked dependencies, fixture renderer and Playwright; `production-locale-browser-qa.yml` for EN/RU contract and actual browser checks |
| Research/schedule/source contracts | `test/` suites and `vixale-*-tests.yml`/contract/preflight workflows; `swing-daily-research-inputs.yml` and `swing-morning-publication-verification.yml` are independent evidence collection/verification |
| Engine 2 | [engine-v2-shadow-tests.yml](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/5f7fd8392cc1263e33018bee5cb84ba6486add1d/.github/workflows/engine-v2-shadow-tests.yml): Node 20, PostgreSQL 16 service, `node --test engine-v2/*.test.cjs`, shared research-input regression, constrained 320 MiB universe test |
| Engine external parity | Engine branch `engine-v2-staging-external-parity.yml`: read-only external observer/API/HTML and provider-readback negative gates; never equate this with authenticated production website parity |

The Engine 2 workflow creates disposable loopback databases `vixale_v2_test`
and `vixale_engine_v2_shadow_20990101`. Preserve their separate URLs and explicit
destructive-test guards. Missing driver/URL can skip integration tests locally;
record those skips rather than claiming PostgreSQL acceptance.

CI is path-filtered. This documentation PR may create no Actions run; report that
accurately. The existing `vixale-public-daily-market-skim.yml` is exceptional:
it has `contents: write` and commits its validated data to main. Do not execute it
as harmless QA or extend its write permission to other jobs. Its broad market
content is distinct from portfolio research/scoring. The
[false-green incident](VIXALE_SWING_CRON_FALSE_GREEN_INCIDENT_20261014.md) explains
why scheduled SKIP or wrong-time success does not certify today's evidence.

## Verification limits and rollback for this documentation change

No strategy, application, workflow, YAML, database, workbook, secret, schedule,
email, bridge or broker action is part of this change. Service metadata and LIVE
revision checks above do not certify today's research, website parity or delivery.
The local instructions and handbook are updated on an isolated branch. The
owner-authorized rollout now ends with verified documentation-only merges into
all three destination branches, with no runtime deploy; see the synchronization
record above.
Rollback is a narrow documentation revert PR; it must not restore historical
data, revoke the established owner authorization or run old rollout commands.
