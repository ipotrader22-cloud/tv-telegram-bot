# VECO Developer Handbook

## Engine 2 Yahoo minute live-tail repair — 2026-10-29

A read-only MSFT `interval=1m&range=1d` response reproduced
`YAHOO_MINUTE_TIMESTAMP_SEQUENCE_INVALID`: the final timestamp was
2026-10-29T16:49:10Z, matching `meta.regularMarketTime`, after the 16:49:00Z
minute slot. Its OHLC values were identical and volume zero. The adapter
previously rejected the entire series before extracting the exact 09:40 mark.
This reproduces a cause consistent with the morning sanitized source-invalid
logs; the original morning payload was not retained, so its exact shape is
not retrospectively proven.

The adapter excludes only a final, non-minute-aligned live quote with the
exact metadata signature, equal positive OHLC, zero volume, and the same
minute as its preceding slot. It never rounds this quote into a candle.
All actual minute ordering, uniqueness, vector-length, completion, session,
and exact 09:39-start/09:40-end gates remain enforced. Regression tests cover
valid tails, mutated signatures, and missing 09:40 evidence. Replaying the
captured source yields MSFT's 13:40Z close with positive source volume.
A subsequent read-only live-source probe obtained exact 13:40Z marks for all
ten staging symbols (NVDA, AMD, AVGO, MU, AMAT, MSFT, AAPL, ORCL, XOM, CVX).

This is a source-parser fix only. No backdated model decision is authorized;
full publication must be verified in a future valid morning window. Require
exact-head CI success before manually deploying isolated staging. Email stays
disabled; no production, bridge, legacy workbook or scheduler changes.
Rollback: revert this commit on the isolated branch and redeploy staging.
Handbook update required: YES.

## Engine 2 staged morning diagnostic refinement — 2026-10-29

The 2026-10-28 pre-open cron produced repeated verified `PREOPEN_PREPARED`
runs, but 10:00–10:20 ET attempts returned only
`STAGING_VERIFICATION_INCOMPLETE`; the private Sheet remained dated
2026-10-27. The failure's underlying cause was not proven from the sanitized
logs, so no model repair or backdated publication is asserted.

The isolated staging worker now maps only known, fixed failure identifiers to
safe, actionable cron reasons: exact 09:40 bar missing/invalid, Yahoo minute
source unavailable/invalid, immutable pre-open state conflict, incomplete
model evidence, and expired decision window. All unknown provider text stays
masked. The classification changes **diagnostics only**, never eligibility,
scoring, quote acceptance, financial writes, model decisions, emails, or
production. Tests cover expected mappings and malicious secret-bearing input.
The new diagnostic is useful only after GitHub CI and an exact-SHA staging
deployment; it cannot retrospectively identify the October 28 failure.
Do not merge/cut over or touch the legacy workbook/bridge. Rollback: revert
this isolated diagnostic commit and redeploy staging. Handbook update
required: YES.


## Engine 2 CI discovery and sanitized corruption regression — 2026-10-28

Do not infer missing CI from the commit-workflow connector alone: it filters
to pull-request events. Query repository Actions runs by exact head SHA without
an event filter, then inspect the matching run and job conclusion. Head
`d381dc92` had push run `40719650115`; it failed one corruption regression
because the test still expected a raw exception message after the pipeline
adopted secret-safe stage codes. The regression now expects
`STAGING_LEDGER_EXCEPTION` and explicitly proves that corruption causes no
additional Sheet write or email. A provider-error regression also verifies
that private exception text cannot escape the ledger boundary.

The existing branch push workflow runs isolated tests with disposable PostgreSQL
databases and read-only repository permissions. Passing local tests alone does
not establish PostgreSQL integration or real morning publication. Require a
successful Actions run at the exact new head before manually deploying either
isolated Render service; both have auto-deploy off. No production merge/cutover,
legacy workbook, trading bridge, customer email or scheduler change is included.
Rollback: revert this test/documentation commit on the PR branch. Handbook update
required: YES.

## Engine 2 cached pre-open evidence revalidation — 2026-10-28

The isolated staging worker no longer treats an existing
`vixale_v2.preopen_preparations` row as automatically prepared. Before returning
`PREOPEN_PREPARED` for a cached session, it reads the current clean-epoch
predecessor and calls the existing `validatePrepared` contract to verify the
artifact fingerprint, exact NYSE session, preparation time and prior-state
identity. A corrupted, stale, or predecessor-mismatched row now fails closed
rather than reporting a misleading successful morning preparation. The new
regression covers valid cache reuse, tampering, wrong session, changed prior
state, and invalid preparation time. No new scores, decisions, sheet writes,
database migrations, production changes, emails, or broker operations.
Rollback: revert the isolated worker and test commits and redeploy the staging
cron/observer after CI. Handbook update required: YES.


## Engine 2 staging morning block-code propagation — 2026-10-27

The isolated cron now preserves only a fixed set of safe worker block reasons:
`STAGING_CONFIGURATION_INCOMPLETE`,
`STAGING_WORKBOOK_METADATA_UNVERIFIED`,
`PREOPEN_PREPARATION_MISSING`,
`STAGING_WORKBOOK_OR_RUNTIME_UNAVAILABLE`, and
`STAGING_VERIFICATION_INCOMPLETE`. Unknown reasons, including dynamic
`MODEL_CYCLE:` / `SHEET:` / `WEBSITE:` provider messages, remain masked as
`STAGING_RUN_REQUIRES_ATTENTION`. This is an observability-only change:
no evidence gate, trade, workbook, scheduler, secret, email or production
behavior is altered. Tests cover exact safe propagation and malicious or
unclassified reasons. Confirm GitHub CI and the exact isolated Render deploy
before relying on new log diagnostics. Handbook update required: YES.


## Engine 2 pre-open completed-session research repair — 2026-10-27

The pre-open collector reused `analyze()` from the legacy intraday research
script, whose mandatory current-session quote check rejected Yahoo's legitimate
previous-session regularMarketTime before 09:30. Reproduced against real source
data as `Quote is not from today's session`; Render exposed only
`PREOPEN_PREPARATION_FAILED`.

Only `preparePreopen` now selects `completedSessionOnly` analysis. It still
requires at least 200 completed daily bars ending on the exact previous NYSE
session for every stock and benchmark. Current-session bars never enter scoring.
Metrics distinguish `researchDate` from the actual `quoteDate`/`quoteTime`;
pre-open output does not claim a current-session percentage change. The legacy
intraday collector and default runtime retain their existing quote checks.
The research bridge/assessor accepts the explicit research date, with fallback
to the older artifact field for existing immutable evidence compatibility.

Regression tests exercise the actual collector/scorer/preparation path with
previous-session source quotes, Monday and holiday-adjacent sessions, stale
stocks/benchmarks, insufficient history, partial bars, and the 09:30 cutoff.
The shared collector's legacy regression also runs in Engine 2 CI. A read-only
real-source preparation completed for all ten staging stocks at 08:10 ET using
October 26 history. This is not database persistence or morning publication
proof; verify the deployed cron separately. No score weights, entry thresholds,
model price policy, production portfolio, secrets, schedules or email change.

Rollback: revert this patch on the isolated PR branch and redeploy the staging
cron; retain all preparations, journals and model history. Handbook update
required: YES. Production cutover remains prohibited.

## Engine 2.0 safe cron phase diagnostics — 2026-10-26

The isolated staging cron now classifies missing/malformed shadow database URLs
as `SHADOW_DATABASE_REQUIRED`, and unexpected failures as one of the fixed
stages `NYSE_SESSION_UNAVAILABLE`, `STAGING_WORKER_INITIALIZATION_FAILED`,
`STAGING_WORKER_CONFIGURATION_FAILED`, `PREOPEN_PREPARATION_FAILED`, or
`MORNING_REVIEW_FAILED`. It never emits provider exception messages, URL
contents or environment values. These diagnostics distinguish failures that
previously all appeared as `STAGING_RUN_FAILED`; they do not relax evidence
requirements or claim a successful source-backed review. Tests cover malformed
URLs, preopen errors and secret-safe reporting. Shadow deployment must be
verified separately; production/main, the legacy workbook, trading bridge and
customer delivery remain unchanged.


## Engine 2.0 dated benchmark integrity — 2026-10-25

The isolated PR #329 mechanical nine-factor assessor now requires every
candidate and every SPY/QQQ/SMH/XLK/XLE benchmark to belong to the exact
previous completed NYSE trading session, not merely any date before the review.
Benchmark records additionally require the current research date, at least
200 completed daily bars, an approved Yahoo chart source, and finite positive
closing/50-day-average evidence plus finite 20/60-day returns. Missing,
duplicated, stale or wrong-session benchmark evidence blocks the entire score
before any model decision. Weekend and holiday gaps use the maintained NYSE
calendar. This is a fail-closed research-evidence gate, not a scoring-weight
change. No production, workbook, bridge, schedule or email changes.

The isolated staging cron now includes an allowlisted `missingCapabilities` array
when configuration blocks a run. It reveals capability names only, never secret
values or provider errors. Use this to diagnose failed pre-open/10:00 staging
runs; a Render deployment reaching Live is not evidence of successful research
or publication.

## Swing Closed Trades dollar column — 2026-10-12

`lib/swing-leaders-core.js` renders P&L ($) between Return and Entry Date.
Each included public trade uses `$10,000 * (exit_price / entry_price - 1)`
without rounding the return first or using shares. Dollars use two decimals,
explicit profit/loss signs and existing green/red gain/loss classes; mobile
rows retain data-labels and the empty row spans nine columns. Unsupported
prices display a neutral dash rather than fabricated P&L.

This is a read-only website column. Existing realized totals still use the
published return percentages, so summing individually rounded price-ratio
values can differ slightly from the preserved summary. Public Feed membership,
Q/R controls, Sheet formulas, API fields, history and review-aware refresh are
unchanged. Tests cover gains/losses, precision, zero, invalid prices, EN/RU
output, unchanged totals and source immutability. Rollback: revert this commit
and allow the normal main-branch Render auto-deploy.
The owner-copy QA fixture now expects the existing October 12 opening-stop
and immediate below-70 exit text, replacing obsolete daily-close assertions.
Russian assertions inspect rendered markup rather than the translation script.

## Swing morning reliability incident — 2026-10-12

The daily research/model writer is a ChatGPT task, not the website or the
publication QA workflow. The October 12 primary task reported a platform safety
rejection of its multi-sheet transaction, then disabled itself; the recovery
task reported re-enabling it. Fail-closed must withhold unverified changes and
delivery, never disable future schedules. The three retained prompts now state
that rule explicitly, limit transient retries, require full-date Resend history
pagination, preserve atomic writes/formulas, and identify independent DATA,
PUBLICATION, and DELIVERY results. A platform safety rejection is not a transient
API error and must not be bypassed.

Publication QA uses `scripts/qa-swing-publication-retry.js`: up to four direct
parity attempts with 60-second spacing and a 70-second per-process deadline.
The workflow serializes its own checks without canceling a running check and
retains dated JSON evidence for 30 days. Exhausted attempts keep the job failed.
This concurrency group locks only publication QA, not ChatGPT portfolio writes.
It does not certify research, formula integrity or Resend delivery, and it does
not generate scores, trade decisions, missing equity rows, or email.

Direct production checking on October 12 passed same-snapshot/cache/history
checks but rejected the expected date: production and the source workbook were
still October 9. Render was live on `75b0d33150e3017caf19e37791bc770c6ef3bd18`.
Resend showed the October 8 and 9 morning reports eventually delivered at
22:26:37Z and 22:40:12Z respectively; no October 12 report was found in the
date-covered history. Routine delivered system tests do not prove report delivery.

Remaining architecture gap: no approved executable research producer, durable
shared writer lock or transactional report outbox exists in this publication
runner. Prompt edits cannot guarantee those mechanisms or resolve a platform
safety block. Do not claim end-to-end stabilization until a verified research
artifact, atomic ledger commit, current-date production parity, and accepted /
delivered Resend record all pass. Existing weekday QA still needs an authoritative
market-calendar gate before treating every holiday date as a missing review.

Rollback: revert the publication-retry workflow/script/test/handbook commit and
restore the saved pre-change prompts. No workbook or broker rollback is required.

**Project:** Vixale Ecosystem (VECO)  
**Status:** Living canonical reference  
**Last updated:** 2026-10-07
**Owner:** Viktor / Vixale  
**Canonical Git location:** `/docs/VECO_DEVELOPER_HANDBOOK.md`  

> **Rule:** Any architectural change, routing change, schema change, deployment change, naming change, or newly discovered gotcha must update this handbook in the same patch. The Git version is the single canonical reference; conversational memory is auxiliary.

---

## 1. Purpose and Scope

**VECO** means the complete Vixale production ecosystem:

- TradingView strategy alerts
- Render / Node.js webhook and website service
- Telegram signals
- Google Sheets trade ledger
- Vixale website and private dashboard
- Local FastAPI IB bridge
- Interactive Brokers / TWS execution

This document is the canonical memory for the project. It should be read before production changes.

This handbook does **not** replace source code. When this document conflicts with deployed code, the deployed production code is the immediate source of truth and the conflict must be resolved in this handbook.

---

## 2. Non-Negotiable Architecture Rules

### 2.1 Execution-first publishing

VECO must not publish a position as OPEN until TWS confirms a real fill.

Expected flow:

```text
TradingView alert
→ Render accepts payload
→ Render forwards to local IB bridge
→ IB bridge submits order to TWS
→ TWS confirms fill
→ IB bridge sends callback to Render
→ Render publishes Telegram / Sheets / dashboard OPEN
```

A submitted, pending, rejected, blocked, or unfilled broker order must not appear as an OPEN trade.

### 2.2 No fake closes

A close alert must not create a closed trade unless the bridge confirms a real broker close fill or a managed target fill.

If the broker is already flat and no matching open row exists, the close must be ignored rather than creating a duplicate or fake result.

### 2.3 Surgical production changes

Production patches should:

- modify the smallest possible surface;
- preserve existing routes and payload contracts;
- avoid rewriting working systems;
- avoid touching website forms, login, dashboard, Sheets, Telegram, or TWS unless required;
- include a complete final file, not a code snippet;
- preserve backward compatibility with existing TradingView alerts whenever possible.

### 2.4 Stock-only production

Current production execution is stock-only. Futures support is postponed until explicitly approved.

---

## 3. Current Production Systems

### 3.1 Vixale Prime (internal Shrek)

**Public VECO name:** Vixale Prime
**TradingView strategy:** `Shrek 1.4`
**Internal strategy ID:** `SHREK_1_4`
**Variant field:** not used

Logic:

```text
SuperTrend flip
→ freeze broken SuperTrend level and ATR(14)
→ wait for pullback touch
→ require reclaim on candle close
→ market entry
→ attached ATR target in TWS
→ close on target, internal opposite SuperTrend flip, or bridge watchdog at 15:59 ET
```

Telegram lifecycle:

```text
🟢 / 🔴 Vixale Prime opened LONG / SHORT
🎯 Vixale Prime hit target
🛑 Vixale Prime hit Stop Loss
⏰ Vixale Prime EOD close
```

Opening Telegram messages include:

- Entry
- Target
- Stop Ref
- Quantity

### 3.1.1 Vixale Prime / Shrek 1.4 naming contract

TradingView and VECO use one canonical strategy identity:

```text
Visible TradingView title: Shrek 1.4
Payload strategy ID: SHREK_1_4
```

The Pine payload does not send a `variant` field. Render and the local bridge recognize
`SHREK_1_4` directly. Legacy Shrek/Opposite-Flip identifiers remain accepted only so
already-created old alerts can be retired safely. These internal and TradingView identities
remain unchanged; only public rendering uses `Vixale Prime`.

### 3.2 Vixale Edge (internal Fiona)

**Public VECO name:** Vixale Edge
**Canonical Pine source:** `/pine/Vixale_Edge_Limit_Pullback_v1_1.pine`
**TradingView title:** `Vixale Edge 1.1`
**Internal strategy:** `VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1`
**Internal variant:** `FIONA_LIMIT_PULLBACK_ATR_TARGET`

Logic:

```text
SuperTrend flip
→ require matching completed 1H and completed 4H SuperTrend bias
→ only a confirmed RTH bar before the deterministic closing bar may create a setup
→ freeze Flip Close or Broken STL anchor
→ freeze ATR(14)
→ publish PENDING_SETUP with a stable setup_id
→ place resting TradingView limit order
→ on TradingView historical/live limit fill, send SETUP
→ bridge executes TWS MARKET entry
→ broker-confirmed ENTRY_FILL moves Pending to Open
→ attach frozen ATR target
→ close on target or internal confirmed-RTH opposite SuperTrend flip
```

Part 3A bridge isolation makes Vixale Edge an explicit execution family before
generic Opposite Flip classification. An Edge `SETUP` represents a
TradingView-virtual limit fill and may create only one ordinary broker MARKET
position per symbol across all timeframes, with the frozen GTC ATR target.
Before submission, the bridge requires the broker position to be flat, no
active managed Edge record for the symbol, and no prior submitted record for
the same `setup_id`. Edge never uses Prime/Shrek reversal-delta math and never
sweeps symbol orders through the generic Opposite Flip path.

The frozen Edge target is mandatory before any broker action. It must be finite
and positive, above entry for LONG, below entry for SHORT, and uses `GTC`.
Missing, zero, non-finite, or directionally invalid targets create no parent or
target order and cancel no existing protective order.

Blocked Edge setups place no broker order and return a publication-only,
`PENDING_ONLY` `CANCEL` with the original `setup_id`:

```text
EDGE_TARGET_REQUIRED
EDGE_ENTRY_BLOCKED_EXISTING_POSITION
EDGE_DUPLICATE_ACTIVE_SETUP
```

An Edge pending setup exists only while its original direction remains
confirmed by both completed 1H and completed 4H SuperTrend bias. Loss of either
confirmation, an opposite primary flip, or RTH expiry cancels the virtual entry
and planned target, publishes exactly one `PENDING_ONLY` `CANCEL`, clears every
pending variable, and removes the orange Pending line. A canceled setup cannot
reactivate when HTF bias later returns; a new setup requires a new fully
qualified primary flip. The legacy `Use 1H + 4H SuperTrend Bias` input remains
for UAM/settings compatibility; disabling it fails closed by preventing new
pending setups and never bypasses confirmation.

For 15-, 30-, 45-, and 60-minute charts, Pine identifies the deterministic
final custom RTH bar from `time()` and `time_close()` calls that explicitly use
the `09:30-16:00` session and `America/New_York`. TradingView constructs that
custom-session bar representation independently of the chart's regular- or
extended-hours alignment, so the final custom bar closes exactly at the
session's 16:00 boundary. The detector does not use the chart `time_close`
variable or infer the final bar from timeframe duration. It publishes
`UNFILLED_BY_MARKET_CLOSE` once and leaves open positions and their GTC targets
untouched. A stored New York session date provides a fail-closed next-session
fallback: missing-date or prior-date pending state is canceled before it can
work in a later session.

Render provides an independent fail-safe for the same virtual Pending state.
On process startup and every five minutes thereafter, `app.js` reads only the
`Pending` worksheet. It classifies Edge rows with the existing lifecycle
helpers and derives their New York session date from immutable
`flip_bar_time`, falling back to the timestamp embedded in the exact
`setup_id`. It never uses the mutable worksheet update timestamp as the sole
staleness source. A row from the current New York date is eligible only at or
after 16:00 ET; a row from an earlier date is eligible immediately because its
session is already complete. Eligible rows are re-read, revalidated, and
deleted by exact `setup_id`.

This cleanup does not synthesize a `CANCEL` webhook or run `processLedger`.
Consequently it sends no Telegram message, forwards nothing to the bridge,
performs no IB/TWS action, and does not read or mutate Trades, Open Positions,
Closed Trades, Prime/Shrek state, or active GTC targets. One process-wide
Pending-sheet mutation serializer covers the cleanup's complete
read/classify/re-read/validate/delete transaction and every existing Pending
upsert, exact setup removal, and symbol/side cleanup. Cleanup uses internal
unlocked helpers while it owns that serializer, preventing nested-lock
deadlocks. A webhook cannot shift Pending row numbers between cleanup
validation and deletion; unrelated Open Positions and Closed Trades operations
are not locked. The scheduler's separate in-flight guard still prevents
overlapping cleanup passes, and deleting an already-removed `setup_id` remains
a harmless no-op. The immediate startup pass supplies restart and after-close
catch-up even when the TradingView alert is stopped or its snapshot never
executes the Pine final-bar logic.

An already-open Edge position is not closed at EOD. Its attached ATR target uses
`GTC`, remains active across sessions, and the payload declares
`eod_policy=NO_EOD_CLOSE`. The bridge marks only Vixale Edge profit-target
limit orders with IB `outsideRth=true`, so the same frozen target may execute
during IB-supported pre-market and after-hours sessions as well as RTH. The
same flag is preserved when a partial entry fill requires the target to be
repaired to the actual broker position. Edge entries and Stop Loss market
closes remain RTH-gated.

This GTC + `outsideRth` contract does **not** claim access to IBKR's separate
Overnight venue (approximately 20:00-03:50 ET). IBKR Overnight / Overnight+Day
orders are DAY-style orders and do not support GTC persistence. Supporting that
venue for a multi-day Edge position would require a separate durable
cancel/replace or daily target-rearm lifecycle with exact target identity and
race-safe reconciliation; that lifecycle is not implemented by this change.
There is no Edge Pine EOD-close option or next-day position reset.

Part 3B distinguishes ordinary and closing-bar Stop Loss signals:

```text
confirmed RTH flip with time_close < 16:00 ET
-> close_execution_policy=IMMEDIATE_RTH
-> bridge runs the existing Part 3A close sequence immediately

confirmed flip on the bar whose time_close reaches 16:00 ET
-> close_execution_policy=NEXT_RTH_OPEN
-> signal_at_rth_close=true
-> durable QUEUED_NEXT_RTH_OPEN bridge reservation
-> no target cancellation or close order that day
-> scheduler resumes at the next IB-confirmed stock RTH session
```

The queued payload retains the exact `setup_id`, `signal_session_date`, and
`signal_bar_time`, with reason `STOP_LOSS_SIGNAL_AT_RTH_CLOSE`. Pine emits it
once per active setup and closing bar, creates no opposite pending setup, and
does not cancel the active GTC target. Pending-only
`UNFILLED_BY_MARKET_CLOSE` cancellation remains unchanged.

For Strategy Tester parity, `process_orders_on_close=false`; ordinary pre-close
Stop Loss calls use `immediately=true`, while the closing-bar market exit is
submitted without immediate fill so the broker emulator fills it on the next
available bar open. Next-RTH-open parity therefore requires an RTH-only chart
and session. If extended-hours bars are enabled, TradingView may fill the queued
`strategy.close` on the next extended-hours bar rather than the 09:30 ET RTH
open. The live bridge remains gated by the authoritative IB stock RTH session.
This is a bar-based emulator approximation, not universal tester/live parity:
it cannot model the bridge's IB holiday/session verification, overnight target
race, or exact TWS execution price.

Telegram lifecycle:

```text
🟣 Vixale Edge opened LONG / SHORT
🎯 Vixale Edge hit target
🛑 Vixale Edge hit Stop Loss
```

The purple circle identifies Vixale Edge. Direction is written explicitly.
`PENDING_SETUP`, pre-broker `SETUP`, and `CANCEL` remain available to the
Sheets/site lifecycle but are Telegram-silent. Telegram OPEN is published only
from broker-confirmed `ENTRY_FILL`; target and Stop Loss messages likewise
remain broker-confirmed. The internal Fiona identifiers remain unchanged.

For a new Vixale Edge `PENDING_SETUP`, the JSON `stop` field contains the
current primary SuperTrend `stLine` on the confirmed flip bar: the current
green/bullish value for LONG and the current red/bearish value for SHORT. This
value is a candle-close threshold/reference, not a native TWS stop order.
Broker-confirmed Telegram OPEN renders it as `Close Under <value>` for LONG
and `Close Over <value>` for SHORT.

The frozen `broken_stl` value remains in raw payload data, setup state, the
status table, and the optional `Broken STL` entry-anchor calculation. It is no
longer drawn as a gray chart line. The legacy TradingView input title
`Show Broken STL + Limit Entry` remains unchanged for UAM automation
compatibility and now controls only the orange pending limit line.

### 3.3 Elvis

**Public VECO name:** Elvis  
**System:** EMA Cross Pullback  
**Status:** Paused

Existing classification and lifecycle must remain backward compatible.

---

## 3A. Forward-Test Engineering Integrations (Not Production)

### SMIO_RSI experimental demo contract — 2026-10-13

Trading Lab has not issued a research freeze or production approval. The owner
separately confirmed the experimental contract
`SMIO_RSI_PINE01_TV_EQUITY_EXACT_DEMO_20261013`: unchanged Pine v0.1 trading
logic, TradingView 10% equity sizing from $1,000,000 initial chart capital,
fractional shares rejected without rounding, and orders only on the verified
shared simulated TWS session. This authorizes Engineering demo integration and
deployment; it does not authorize real-money trading or claim Pine/NT8 parity.
See `docs/SMIO_RSI_INTEGRATION_REVIEW.md` for source/install/deploy evidence.

The original research profile remains preview-only. The additive UAM profile
`smio_rsi_demo.json` uses the existing selected/bulk workflow and requires both
`/health/smio-demo` and loopback `/ib/smio-demo-status` to report the exact ready
contract before creation. Every chart verifies $1m/10% Properties, exact Excel
Inputs and an atomic source/settings snapshot. User criteria, alert ledgers,
Prime/Edge profiles and existing research Pine are preserved. The demo Pine
changes only its title and transport marker; the behavior-equivalence test
removes those lines and compares the entire remaining source.

The existing `/tv` route admits only strict tagged demo signals, records durable
event identities, and defers trade publication until authenticated broker fills.
Old/partial SMIO identities and LIVE mode remain rejected before generic routing.
Callbacks use the existing quote-bridge key in a header; no new key or secret in
payloads. Confirmed records display `SMIO_RSI Demo`, with actual execution qty,
weighted fill prices, exact setup ownership and existing publication deduplication.

`bridge/smio_demo_adapter.py` reuses the same core IB client and lock. Its local
`smio_demo_config.json` attests the observed simulated UI/account and references
UAM's snapshot directory; account identity is never an extra UAM setting or Git
artifact. Durable `smio_demo_journal.json` writes intent before mutation. Exact
SMIO entry/target/close references, execution history coverage, position proofs,
partial parent/target/close handling, cancellation confirmation and ordered
outbox delivery prevent symbol fallback, reversals and duplicate retries. A
foreign execution cancels only the stale owned target and reserves the setup for
review. Unproven restart history remains blocked. No broker record is fabricated.
…42469 tokens truncated…ey/value conditional delete followed by same-ID create. Each financial batch replaces BOTH exact expected fence and owned lease in the same ordered atomic batch as the ledger/feed/history changes. Duplicate-ID rejection on a changed value aborts the whole batch. See docs/ADR_SWING_NATIVE_WRITE_FENCING.md for the complete recipe, release/timeout rules and connector metadata readback. Never infer locking from GitHub concurrency or writer windows alone.

Live metadata proof: a wrong-value guarded batch failed HTTP400 on duplicate ID; a correct-value batch succeeded. Disposable metadata were removed; persistent production fence initialized. A later real service-note alignment used the guarded batch, verified factor notes after row compaction, then released its lease. Independent cloud readback verified the current fence and free lease. No broker or financial event was generated by these lock tests. Protection depends on all participating writers following the protocol; arbitrary unguarded manual edits and exact-second scheduling remain outside its guarantee.

Completed daily review: all thirteen then-active/candidate scores were reassessed on actual dated technical inputs and private news evidence. Five authorized below70 model exits were recorded without replacement entries or duplicate opening exits. All current active representations reconcile; public notes are concise and full-review dates are current. The historical unrealized mark was restored only from a delivered dated report with honest evening publication-time provenance; current-date unrealized is numeric/frozen while protected Q/R, cash, spill and C/E/F formulas remain intact. Closed Last Score uses verified current research, not immutable Entry Score. Full-date provider dedup and delivered report/event readbacks passed. Independent main research-input and full-day publication workflows passed and retained artifacts.

Validation boundary: the migrated 9:30 task has not yet completed its first timed October13 run. No executable server-side analyst/outbox worker was added; orchestration remains cloud scheduled research tasks, native guarded commits, provider idempotency and independent read-only Actions checks. Do not describe this as a guaranteed scheduler or completely deterministic autonomous scoring engine. No app.js/package.json/runtime/credentials changes in this documentation checkpoint. Rollback: revert these docs only; production metadata/task controls are separate and must not be silently removed by a documentation revert.



## 2026-10-22 — Engine 2 durable private staging pipeline (PR #329)

Handbook update required: **YES**. Architecture: see
`docs/ADR_ENGINE2_STAGING_PIPELINE.md` for the transaction, recovery, formula and
activation contract. PR remains **DRAFT / UNMERGED**, with no production cutover.

- `engine-v2/staging-pipeline.cjs`, `staging-pipeline-store.cjs` and
  `staging-artifact.cjs` coordinate durable research/model commit → private native
  Sheet batch/readback → exact uncached API/HTML → separately enabled staging
  email with persisted message identity and confirmed delivery. Canonical hashes
  survive PostgreSQL JSONB ordering. Full research source evidence is retained.
- `staging-research-runtime.cjs` collects an explicitly configured independent
  Yahoo universe and company news, preserving verified exchange labels. Uses the
  existing versioned mechanical nine-factor policy; catalyst remains zero until
  substantive event evidence is independently vetted. No legacy holdings seed
  the universe. Late collection blocks instead of backdating.
- `target-window-provider.cjs` verifies every regular-session minute since the
  last certified watermark, including yesterday afternoon. Missing coverage or
  a missed daily opening-stop review blocks. Prior-day targets precede today's
  opening stop; actual exit date and effective review date are distinct.
- `staging-sheets-publisher.cjs` checks all planned cells/formulas, normalized
  equity, cash, extra lots and immutable closed rows. A lost batch response
  recovers only the same native fence/date/content. The only workbook target is
  `1Ii20kcegWWhQfz_RUrDe0OhfFG1y9TNjrEI1Xy6mqyA`.
- Staging Open Positions R now stores **Review Reference Price ($)**. Public Feed
  current/return formulas use R, preserving the fixed review snapshot for page
  and email while Open Positions I:L and Portfolio retain Google Finance.
  Public Feed B7/A33 and Equity C/E/F remain formulas; Closed Q/R are preserved.
  Exact live staging B7/A33 formulas were read and matched to the guard constants.
- `shadow-swing-page.cjs` matches the inspected authenticated page structure:
  light header, Active Portfolio introduction beside equity chart, total P&L,
  four KPI cards, four explanation cards and matching Active/Closed column order.
  Existing production authentication, English/Russian flows and site unchanged.
- `shadow-health.cjs` serves the Sheet-verified journal artifact (or existing
  truthful inception/clean-ledger preview) with no-store. Query-string cache
  busting is supported. Health exposes only configuration readiness/status,
  never credentials, recipients or private research. Production readiness false.

### Staging configuration and outstanding verification

All settings belong only to `vixale-engine-v2-shadow-observer`:

- `VIXALE_V2_STAGING_PIPELINE_ENABLED=YES`: explicit worker activation; off by default.
- `VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON`: staging write identity; must already
  have editor access to the private staging workbook.
- `VIXALE_V2_RESEARCH_UNIVERSE`: independently selected comma-separated candidates.
- `VIXALE_V2_RESEARCH_SECTORS_JSON`: candidate-to-SMH/XLK/XLE mappings.
- `VIXALE_V2_STAGING_EMAIL_ENABLED=YES`: separate email activation; off by default.
- `VIXALE_V2_STAGING_EMAIL_TO` and `VIXALE_V2_STAGING_EMAIL_ALLOWLIST`: same approved
  staging recipient. No customer list or production recipients are inferred.
- `VIXALE_V2_STAGING_RESEND_API_KEY`: staging send/read credential; never printed.

The shadow service's existing root npm install includes googleapis and pg. Its
current **free web plan can sleep**, so the in-process 60-second timer is not a
production scheduling guarantee. Do not call autonomous daily publication live
until an approved durable trigger/always-running service and a real morning
provider-to-Sheet-to-page-to-confirmed-email test pass. Current staging workbook
permission metadata shows **owner only**; service-account editor access has not
been established. No real staging financial write or email was performed here.

Validation adds real HTTP page/API tests with synthetic provider boundaries,
ambiguous Sheet/send recovery, no duplicate sends, full visible-content mismatch,
recipient/formula/hash failures, target coverage, and real PostgreSQL journal
roundtrip/competing-lock/restart/idempotency checks. CI uses a separate disposable
loopback database `vixale_engine_v2_shadow_20990101`; never run its cleanup against
an existing shadow or production database. Exact check/deploy evidence is recorded
in the PR after completion. Production app, Windows bridge/TWS and legacy live
schedule were not modified. Roll back only the isolated shadow code/flags.

## 2026-10-23 — Independent staging cron command (PR #329)

`engine-v2/staging-cron.cjs` runs one staging cycle and exits without starting a
web server or importing the legacy portfolio. Shadow mode and the existing shadow
database-name allowlist are required before constructing the worker. NYSE-closed
days and the alternate UTC hour are skipped; an unmaintained calendar fails closed.
Provider exceptions, credentials, recipients and private artifacts are never logged.
Failed/bounced/complained/suppressed runs exit nonzero. API acceptance remains
ACCEPTED_NOT_DELIVERED, requiring another scheduled check; it is never called delivery.

Prepared Render cron settings (not provisioned):
- Repository/branch: existing PR #329 branch, not main; auto-deploy disabled.
- Region: Oregon, same workspace and private database as the shadow observer.
- Build: `npm install --no-save --no-package-lock pg@8`.
- Start: `timeout --signal=TERM 240s node engine-v2/staging-cron.cjs`.
- UTC schedule: `* 14,15 * * 1-5`. Code permits only 10:00–10:20 ET on NYSE
  sessions, handling DST; fresh model commits remain restricted to 10:00–10:05 ET.
  Later invocations only finish/recheck durable work; missing first runs fail closed.
- Configure the shadow database URL and dedicated staging credentials securely
  on the cron service. No production credential copying or checked-in secret values.
- Keep the observer publisher disabled when cron becomes the designated writer;
  it continues serving the shared journal's verified snapshot. Existing database
  advisory locks also protect accidental overlapping invocations.
- A cron may need to wake the free preview server during HTTP readback. Retry
  from the durable Sheet receipt; a timeout is not evidence of website parity.
- Monitor nonzero exits and independently check journal delivery=DELIVERED after
  the retry window. A successful process exit with ACCEPTED_NOT_DELIVERED is not
  an end-to-end pass. No failure-alert destination is configured by this change.

The owner approved a sole staging recipient, saved together with its matching
allowlist on the shadow service; sending remains disabled. The recipient-setting
deployment reached LIVE at commit 593c206. VIXALE's Resend domain is verified.
Staging workbook permissions still show only its owner. Connected Drive tools can
grant file access but cannot create a Google Cloud IAM service-account credential.
The owner must provision a dedicated Sheets-enabled service account and securely
install its JSON as VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON; only its non-secret
client_email is needed to grant staging editor access. A dedicated Resend send/read
credential must also be installed securely. Do not send credentials in chat.
No paid cron resource, live staging write, email or production cutover was created.

Rollback: leave publisher/email disabled, remove the cron schedule if later
provisioned, and redeploy the prior shadow revision. Preserve the durable journal.

## 2026-10-23 — Dedicated staging identity and read-only access preflight

Owner created vixale-engine2-staging@tv-trading-journal.iam.gserviceaccount.com
and securely installed its credential on the shadow service. Drive permission
readback confirms writer access only to the private staging workbook was added.
The owner-triggered deployment reached LIVE at 876ba7d.

`staging-preflight.cjs` performs GET-only workbook metadata validation at shadow
startup even while the publisher is disabled. It rejects a different identity
before constructing the client; health returns only sanitized access status,
configuration validity and credential-presence booleans. It does not prove a
financial write or actual market-provider coverage. No keys or error bodies are
returned. No lease, portfolio cells or email are mutated by this check.

Bounded integration-test universe: NVDA, AMD, AVGO, MU, AMAT (SMH); MSFT, AAPL,
ORCL (XLK); XOM, CVX (XLE). This deliberately exercises all three currently
supported sector benchmarks and is not the final production selection universe.
Production universe breadth and factor coverage still need review before cutover.
The workbook and email publishers remain disabled pending real provider and
delivery verification. The approved staging email recipient is already configured.

## 2026-10-23 — Publication-first scope and independent cron provisioned

Owner deferred morning email: publication success requires real research, durable
portfolio commit and exact Sheet/API/HTML readback, not Resend credentials or
delivery. Keep email disabled. EMAIL_DISABLED is a terminal journal state for
pending-run selection and does not prevent the next session. Sixteen focused
pipeline/cron tests passed with this existing behavior.

Owner approved the Render cron charge (minimum $1/month plus usage). Created
`vixale-engine2-staging-daily`, resource `crn-dbdknsl9fdbs73bfloi0`, in Oregon,
on the isolated PR branch with auto-deploy off, starter plan, schedule
`* 14,15 * * 1-5`, and the documented 240-second cron command. Email is explicitly
NO; pipeline is explicitly NO pending credential wiring. This is not an active
or verified morning publisher yet. No production service was modified.

The new cron has the same bounded staging universe/sector configuration as the
shadow observer. Owner must securely add VIXALE_V2_SHADOW_DATABASE_URL from the
existing isolated observer (or shadow Postgres Internal connection URL) and
VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON using the dedicated staging identity.
The connected service-creation tool accepts literal values but cannot reference
existing service secrets or environment groups. Never place these values in
source, comments, logs or chat. After values are installed, verify the cron build
and configuration before setting its pipeline flag YES. Keep the observer's
writer disabled and use the shared shadow ledger for preview readback.

Disable the cron pipeline or suspend its schedule to roll back activation; keep
the existing journal. New-epoch end-to-end verification and production website
cutover remain pending.

## 2026-10-23 — Legacy scheduler retirement audit (read-only)

Five enabled ChatGPT automations were inspected. No task was changed or disabled.
- 09:51 Swing Opening Stop Check: retire at cutover after Engine 2 opening-stop evidence is verified.
- 10:00 Swing Portfolio Review: legacy writer/email publisher; retire at verified cutover. Its two-new-entries/day cap conflicts with Engine 2.
- 10:25 Swing Recovery & Email: legacy recovery writer/email publisher; retire after Engine 2 publication retry/restart verification. Its two-additions cap is also stale.
- Intraday Target & Change Monitor: not yet fully replaced. Its hourly same-day target publication differs from Engine 2 morning reconciliation of the preceding interval. Implement equivalent Engine 2 intraday coverage or obtain an explicit timing-policy decision before retiring it.
- VIXALE 2 Clean-Slate Build: retain during implementation; its mandatory email-delivery gate is stale under the owner's publication-first scope and needs prompt correction. Retire after stable handoff.

Fetched origin/main confirms four scheduled GitHub workflow definitions.
Swing Daily Research Inputs is a retirement candidate once independent Engine 2
research is verified. Swing Morning Publication Verification should be retained
and adapted to the new epoch/schema. Public Daily Market Skim and Production
Locale Browser QA serve separate functions and should remain. This verifies
repository schedule definitions, not GitHub's runtime enabled state or delivery.
Render inventory contained only the newly provisioned Engine 2 cron; no older
Render cron was identified. Windows Task Scheduler/TWS jobs were not inspected
or changed and are outside this retirement scope.

Do not treat the new cron's successful build as an end-to-end publication PASS.
Its two isolated credentials remain unwired and its publisher remains disabled.
Coordinate legacy-writer retirement with verified production cutover; do not
leave competing writers publishing the same portfolio.

## 2026-10-23 — Owner-installed cron credentials and staging activation

Owner confirmed both isolated credentials saved and deployed. Verified cron
deploy dep-dbdusnbncjis73dj9jv0 LIVE at 5925435. Connector cannot inspect secret
values; this is not yet credential-access or publication verification.
Merged only VIXALE_V2_STAGING_PIPELINE_ENABLED=YES and
VIXALE_V2_STAGING_EMAIL_ENABLED=NO into the cron environment, preserving all
other values. Requested activation deploy dep-dbdutemc36kc738267bg at 5925435.
The observer writer, production services, legacy schedules and TWS are unchanged.
Twenty-five focused cron/preflight/target/minute-provider tests passed. Real
provider-to-workbook publication and subsequent preview parity remain pending
the next supported session window (Monday October 26, 10:00 ET). No backdating
or off-window bypass. Rollback: set only the cron pipeline flag NO and deploy.

## 2026-10-23 — Owner-defined delayed-price staging scenario

Handbook update required: YES. The owner requested formalizing the pre-open
prior-session research / 10:00 decision / 09:40 model-price scenario for staging.
See docs/ENGINE2_STAGING_DELAYED_0940_RUN.md for timing, provenance, model price
semantics, accounting order and acceptance cases. This is a specification, not
an implemented or verified new runtime. The current enabled cron still uses
the old logic; its LIVE status does not certify this scenario. No production
code, broker path, schedule or environment was changed by this documentation.

## 2026-10-23 — Delayed 09:40 staging implementation

Handbook update required: YES. PR #329 adds an explicitly selected delayed model
policy, immutable pre-open preparations in the isolated database, prior-session
stop/target queues, fixed completed-bar cutoff, exits-before-entries accounting,
and distinct decision/source timestamps. See ENGINE2_STAGING_DELAYED_0940_RUN.md
for exact policy, UTC schedule, deployment gates and rollback. No broker path or
production code changes. The old five-minute freshness rule remains unchanged
for other modes. Real provider/authentication/publication acceptance is pending;
new schedule must include pre-open invocations. Email stays NO.

Delayed-policy ledger commits also compare the exact persisted pre-open artifact
inside the transaction; a caller cannot replace it with a newly hashed artifact.
The PostgreSQL integration test exercises missing-artifact rejection, JSONB
roundtrip, next-session delayed commit and idempotent replay.
