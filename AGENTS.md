# AGENTS.md — VECO Codex Operating Rules

## Scope

These instructions apply to the entire `ipotrader22-cloud/tv-telegram-bot` repository.

**VECO** means the complete Vixale Ecosystem:

- TradingView alerts
- Render / Node.js service
- Telegram
- Google Sheets
- vixale.com website and private dashboard
- local IB bridge
- TWS execution

Before changing anything, read:

```text
docs/VECO_DEVELOPER_HANDBOOK.md
```

The handbook is the canonical project memory. The repository and deployed production code are the source of operational truth.

### Operating references and precedence

For Active Portfolio work, also read
[`docs/VIXALE_Active_Portfolio_Source_of_Truth.md`](docs/VIXALE_Active_Portfolio_Source_of_Truth.md).
It is the prospective allocation amendment, not a replacement for the FINAL
October 12 Source of Truth and Operational Control supplied with the project.
Read those sources before financial, publication, automation or email changes;
files under a synced project `sources/` directory are read-only references.
Use later explicit owner amendments only for the behavior they supersede.
Historical holdings, rollout commands, paused-task lists and deployment IDs are
evidence of their date, never current inputs or standing instructions to replay.

Before state-changing actions, re-read the relevant live source and verify its
identity, revision and ownership. Code establishes implemented behavior; it does
not authorize a strategy change. Resolve specification/runtime conflicts before
the affected mutation, without silently choosing a new trading rule.

The [repository audit and verification map](docs/VIXALE_REPOSITORY_OPERATING_MAP.md)
records implementation references, deployment branches, configuration boundaries
and test entrypoints. Engine 2 paths in that map belong to its deployed branch
and are not present on website `main`. Read the applicable branch's handbook,
ADRs and any nested `AGENTS.md` before editing that subsystem.

---

## Branch applicability — Engine 2 financial writer and observer

- This branch is the Engine 2 financial writer/observer source. Start narrow
  changes from its freshly fetched head and target PRs back to
  `engine-v2-shadow-foundation-20261016`, not `main` or the IBKR probe branch.
- The cron alone runs the financial pipeline and delivery outbox. The observer
  remains a snapshot/valuation reader and read-only auditor. Preserve the
  branch's research, preparation, PostgreSQL, Sheets fence, model and delivery
  contracts, and its full Engine 2 CI workflow for runtime changes.
- The current approved Google research/quote sources remain unchanged. An IBKR
  OAuth probe or successful authorization is not permission or evidence to
  replace a provider, enlarge broker scope or submit orders.
- Engine services currently have auto-deploy off. Documentation synchronization
  does not require a manual deploy, restart, initialization hook or cron run.
- The shared operating rules below describe the whole ecosystem. Website-only
  modules, preload chains, browser workflows and the November 8 rollout belong
  to website `main`; they are cross-branch references, not instructions to copy
  application code or replace this branch's handbook with the website handbook.
- For this owner-authorized November 24 instruction rollout, merge only the
  reviewed documentation PR into this branch after documentation checks pass.
  The earlier PR-only endpoint applied to PR #431's original task; the owner
  subsequently authorized merging and completing all three branch updates.
  Preserve future explicit PR-only/no-deploy boundaries.
- For a documentation-only merge that needs no runtime rollout, use the
  documented [Render commit skip phrase](https://render.com/docs/deploys#skipping-an-auto-deploy)
  `[skip render]` in the final merge commit and verify service event/deploy
  history afterwards. Do not change auto-deploy settings, credentials or
  schedules. A skipped deploy is intentional, not a runtime acceptance claim.

## ChatGPT/Codex Session Bootstrap

At the start of every VECO production session:

1. Read `/AGENTS.md` and `/docs/VECO_DEVELOPER_HANDBOOK.md` completely.
2. State `Handbook update required: YES / NO`.
3. Confirm the canonical repository, current branch, `git status`, and synchronization with `origin/main`.
4. Verify the deployed source relevant to the task. For bridge work, compare
   `/bridge/ib_bridge.py` with `C:\ib_bridge\ib_bridge.py` without reading or
   copying `.env` values into the repository.
5. Identify the execution boundary before editing:

```text
TradingView -> Render/app.js -> local IB bridge -> TWS confirmation
            -> Render callback -> Telegram / Sheets / dashboard
```

6. Never expose secrets or infer that a submitted order is a fill.
7. Use a narrow feature branch, run the relevant checks, review the complete
   diff, push the feature branch, and open a Pull Request. For eligible normal
   Engineering tasks, apply the Standing Owner Authorization below and continue
   through merge/deploy without asking for a second approval message.

---

## Default Operating Mode

For a normal requested change, Codex should complete the following workflow in one task unless the user explicitly asks for a read-only audit or a different stopping point:

1. Confirm the current branch and Git status.
2. Fetch and update from `origin/main`.
3. Start from a clean, current `main`.
4. Create a narrowly named feature branch.
5. Make the smallest surgical change.
6. Update `docs/VECO_DEVELOPER_HANDBOOK.md` when required.
7. Run relevant checks.
8. Review the complete diff.
9. Commit the approved task to the feature branch.
10. Push the feature branch.
11. Create a Pull Request into `main`.
12. If the task is eligible under the Standing Owner Authorization below, merge the PR to `main`, allow the normal production deployment, verify the exact deployed commit reaches Live, and report the result. If an exception applies, stop before merge and request the required task-specific approval.

Branch exception: website work starts from current `origin/main`. Engine 2
writer/observer work starts from, and targets, the freshly verified deployment
branch (last verified `engine-v2-shadow-foundation-20261016`). Never merge the
entire Engine 2 foundation into `main` to deliver a narrow engine change. Use an
isolated worktree when existing checkouts contain unrelated work; do not reset,
stash or overwrite that work. A request to submit a PR is a PR-only endpoint.

Codex may commit, push the feature branch, create the Pull Request, and—when eligible under the standing authorization—merge/deploy as part of the same task.

## Autonomy and Completion

**Owner instruction dated 2026-10-25:** carry requested Engineering work through
to a completed, verified result within the authorized scope.

- Continue through investigation, implementation, appropriate checks, fixing
  relevant failures, and preparing the reviewable deliverable. A plan, code
  change, or opened PR is not automatically completion; verify the requested
  acceptance criteria and follow the authorized workflow to its endpoint.
- Do not pause for routine confirmation or ask "Shall I continue?" before
  necessary next steps already covered by the request. Make reasonable choices
  for minor ambiguities and briefly record consequential assumptions.
- Give concise progress updates while continuing work. An update is not an
  approval request, and an intermediate milestone is not a stopping point.
- Investigate errors and try appropriate alternatives before declaring a
  blocker. Use bounded retries for transient failures; do not loop indefinitely
  or bypass a permission denial, required check, or safety gate.
- Ask only when essential information cannot be obtained, a consequential
  decision cannot reasonably be inferred, an action exceeds authorization, or a
  required approval blocks progress. Do not request permission again for an
  action already authorized by the task and applicable workflow.
- If blocked, complete independent in-scope work first, then report the exact
  blocker and the smallest action needed from the owner. Prepare all authorized
  prerequisites before requesting a final decision.
- Preserve existing work and stay within the requested scope. Do not expand
  the task into unrelated improvements.
- Report what was completed, how it was checked, and any remaining limitations.
  Never claim completion, deployment, or continued background work without
  evidence.

The Standing Owner Authorization below remains the authority for merge/deploy
eligibility and exceptions. This section does not expand that authorization or
override an explicit read-only, PR-only, staging-only, or no-deploy boundary, or
a separate trading-system activation/paper/shadow gate.

## Standing Owner Authorization — Merge and Deploy

**Owner instruction dated 2026-10-06:** for normal Engineering tasks that the owner has explicitly asked Codex to implement, successful completion of the requested change carries standing authorization to merge the task PR to `main` and allow the normal production deployment **without asking for a second “merge and deploy” confirmation**.

This standing authorization counts as explicit owner approval only when all of the following are true:

- the requested scope is implemented on a feature branch;
- the complete diff is narrow and contains no unexpected files or behavior;
- relevant syntax/tests/checks pass, or the repository has no required CI and the available scoped checks pass;
- there is no unresolved Source-of-Truth conflict;
- rollback is clear;
- deployment uses the normal approved production path (for example Render Auto-Deploy from `main`) and the exact deployed commit is verified.

The standing authorization does **not** authorize:

- a task the owner explicitly marks read-only, PR-only, “stop before merge,” or “do not deploy”;
- merging with failed required checks, unresolved conflicts, or unexpected scope;
- unvalidated trading-strategy behavior changes, frozen Trading Lab contract changes, or silent Pine/entry/exit/stop/target/risk/session/parameter changes;
- destructive Git/history operations;
- production secret or environment-value changes;
- destructive database/data migrations or deletions;
- bypassing any separate activation/paper/shadow gate explicitly required by the frozen trading-system lifecycle.

Direct pushes to `main` remain prohibited for normal work; use the PR workflow. A task-specific owner instruction always overrides this standing default.

GitHub or operating-system permission prompts may still require the user to click **Allow once**.

---

## Non-Negotiable Safety Rules

### Never bypass execution-first

The broker-executed VECO path must not publish an OPEN or CLOSED trade until TWS confirms the real broker fill. The separate Active Portfolio path publishes explicitly labeled model events under the rules below; it never submits broker orders.

Do not weaken or bypass:

```text
TradingView
→ Render
→ IB bridge
→ TWS confirmation
→ Render callback
→ Telegram / Sheets / dashboard
```

### Never create fake lifecycle events

Do not create public or ledger OPEN/CLOSE events for:

- submitted but unfilled orders;
- rejected orders;
- blocked orders;
- stale callbacks;
- already-flat broker positions;
- duplicate target or close notifications.

### Preserve production systems

Do not change unrelated behavior in:

- Telegram
- Google Sheets
- website
- dashboard
- login/auth
- Render routes
- webhook payload contracts
- bridge forwarding
- TWS execution
- forced EOD
- target reconciliation

unless the task explicitly requires it.

### Stock-only production

Do not enable futures in VECO production unless the user explicitly approves it.

### Secrets

Never print, commit, copy, or expose:

- Render environment values
- Telegram tokens
- Google service-account JSON
- dashboard keys
- Resend keys
- bridge `.env`
- Deploy Hook URLs
- TradingView session/profile data
- TWS credentials

Do not modify production environment variables unless explicitly instructed.

---

## Source and Classification Rules

Core broker-system identities (this is not an activation inventory):

```text
Shrek
TradingView: Shrek 1.4
Strategy ID: SHREK_1_4
Variant field: not used

Fiona
TradingView: VX_FIONA_LIMIT_PULLBACK_LIVE_v1.0
Variant: FIONA_LIMIT_PULLBACK_ATR_TARGET
```

Classification precedence is architecture-sensitive:

1. Fiona Limit by its specific variant.
2. Shrek / generic Opposite Flip.
3. Elvis / EMA Pullback.
4. Older Vixale families.

Shrek 1.4 uses the dedicated `SHREK_1_4` strategy ID. Legacy Shrek/Opposite-Flip identifiers remain recognized for old alerts. Never move generic legacy Shrek classification ahead of the specific Fiona classifier.

---

## Code-Change Rules

- Work against the latest repository version; do not replace `app.js` with an older chat/download copy.
- Edit the repository directly.
- Change the smallest possible surface.
- Do not rewrite working modules for style or cleanup.
- Preserve backward compatibility with existing TradingView alerts whenever possible.
- Do not combine unrelated changes.
- Preserve English and Russian website flows.
- Preserve existing routes and payload fields unless the task explicitly changes the contract.
- When a complete file artifact is requested for emergency/manual use, `app.js` should be delivered as `app.js.txt`; the Git version remains canonical after merge.

---

## Handbook Update Rules

At the beginning of every task, state:

```text
Handbook update required: YES / NO
```

Update the handbook in the same branch and commit when the task changes or discovers:

- architecture
- event routing
- payload/schema contracts
- public system naming
- Telegram lifecycle
- Google Sheets structure
- website/dashboard structure
- authentication
- deployment behavior
- folder structure
- configuration locations
- reusable components
- operational procedures
- a production gotcha
- a new architectural decision

Pure typo or isolated copy edits normally do not require a handbook update unless they change a documented convention.

When the change is architectural, add or amend an ADR.

---

## Git Rules

Default branch:

```text
main
```

Normal workflow:

```text
main
→ feature branch
→ checks
→ commit
→ push feature branch
→ Pull Request
→ merge/deploy automatically when eligible under Standing Owner Authorization
→ verify exact production deploy
```

Use narrow branch names, for example:

```text
feature/dashboard-fiona-label
fix/telegram-stop-ref
docs/update-veco-handbook
```

Never:

- force-push;
- rewrite published history;
- push directly to `main`;
- merge outside the Standing Owner Authorization or a task-specific explicit approval;
- delete unrelated files;
- include secrets;
- mix unrelated changes in one commit;
- claim deployment succeeded without verifying it.

Emergency direct-to-`main` work is allowed only when the user explicitly says it is an emergency and explicitly approves direct production deployment.

---

## Required Checks

For any `app.js` change, run at minimum:

```bash
node --check app.js
```

Also run relevant available repository checks from `package.json`.

For website changes, inspect the affected English and Russian output.

For routing, Telegram, Sheets, or execution changes, verify the affected lifecycle path and report the verification plan.

For documentation-only changes, verify:

- only intended documentation files changed;
- `app.js` is unchanged;
- `package.json` is unchanged.

---

## Pull Request Requirements

Every production or architectural PR should include:

- problem statement;
- current behavior;
- desired behavior;
- exact files changed;
- tests/checks run;
- payload/schema impact;
- backward-compatibility impact;
- deployment impact;
- rollback plan;
- `Handbook update required: YES / NO`.

Before creating the PR, verify the diff contains only intended files.

After the PR checks are clean, continue through merge/deploy automatically when the task is eligible under the Standing Owner Authorization. Otherwise stop before merge.

---

## Render Rules

The production website Render service tracks `main`. The Engine 2 writer and
observer use their separate deployment branch; verify each service rather than
assuming every VIXALE service tracks `main`.

A merge or push to `main` may trigger Render Auto-Deploy.

Therefore:

- feature-branch pushes are allowed;
- Pull Request creation is allowed;
- merge to `main` is pre-authorized for eligible normal tasks under the Standing Owner Authorization; excluded/sensitive operations still require task-specific approval;
- do not use or reveal the Deploy Hook;
- do not claim Render is Live without checking deployment status and startup logs.

Codex does not need to press a Render deploy button when Auto-Deploy is enabled for `main`.

---

## Authorized Active Portfolio Rules

- Preserve the November 13 owner amendment, effective for new decisions from
  November 16, 2026: verified current nine-factor score **strictly above 70** is
  the sole entry signal. Fill free slots by descending score, ticker order for
  ties, at most ten positions of fixed normalized $10,000 each. Do not restore
  the old 80-point/setup/catalyst entry gates or add discretionary approval.
- Keep eligible holdings; score 70 may remain held but cannot initiate entry.
  Do not replace a holding merely because a candidate scores higher. Insufficient
  qualifying candidates leave empty slots. Realized losses do not reduce the
  ten-slot limit; negative formula-derived residual cash is model accounting,
  not borrowing or broker leverage.
- Preserve the pinned 518-security S&P 500/Nasdaq 100 universe and its versioned
  membership/exclusion evidence. Missing research is not a low score. Do not
  shrink the universe or change weights to make a failing review pass.
- The nine factor caps total 100: Market 10, Sector/Theme 15, Leadership 15,
  Catalyst 10, Base 15, Compression 10, Volume/Accumulation 15, MA 5,
  Resistance 5. Retain dated facts, source hashes, completed-session OHLCV,
  actual exchange volume and at least 200 completed daily bars where required
  by the collector. Verify points, caps and sum. Preserve the implemented
  versioned assessor; do not invent scores or a replacement rubric.
- Opening STOP LOSS requires a lot held at that opening and verified 09:30 ET
  regular-session OPEN <= original entry × 0.95, inclusive. An intraday low,
  current quote below the reference, or prior close is not opening evidence.
  Record the later verified model exit quote/time separately from the trigger;
  never backdate to 09:30 or assume a fill at the threshold.
- TARGET requires verified regular-session evidence at or above entry × 1.10
  while the exact lot was open; close the full model lot at entry × 1.10.
  Exclude pre-entry/after-hours highs. Preserve ordered trigger evidence and
  scan watermarks; missing interval coverage cannot certify no target.
- A newly verified score below 70 triggers the existing
  `DROPPED FROM ACTIVE PORTFOLIO` exit at the verified model quote. Missing or
  pending reassessment never creates a dropout. No continuous intraday -5%
  stop or intraday rescoring is authorized.
- New entries use new dated lot identities, including previously closed
  tickers. Deduplicate against all closed lots, including Q=NO; prohibit
  same-session exit/re-entry churn and reused same-date lot IDs. Preserve the
  date-specific entry policy when replaying historical decisions.

These model rules do not alter Prime/Shrek, Edge/Fiona, SMI forward-test or
SMIO demo contracts. Preserve strategy-specific paper/activation gates, sizing,
targets, session rules and exact broker ownership. SMIO demo approval is not
live-money approval; an Options display or IBKR data probe does not enable
futures in the stock execution service.

## Data Integrity and Publication

- Keep original entry prices/scores, closed lots, immutable events, evidence
  hashes and historical valuations. Current research score and Closed Trades
  Last Score are not the immutable Entry Score. Never rewrite history to make
  today's reconciliation succeed or import legacy lots into the clean epoch.
- Model P&L is `10000 * (mark / entry - 1)` per included lot; model equity is
  `100000 + realized + unrealized`. Do not derive it from rounded displayed
  percentages, whole-share quantities or brokerage P&L. Round for display only.
- Closed Trades Q controls inclusion; R is Public P&L Effective Date. Q=NO is
  soft exclusion, never deletion or permission to reuse a lot. Preserve
  Q/R-aware realized history, Public Feed cash and Closed Trades spill/filter
  formulas (B7/A33 in the inspected workbook), and Equity History C/E/F formulas.
  Equity D is the captured numeric unrealized mark with its actual time, never
  a historical reference to mutable current holdings. Do not add duplicate dates.
- Reconcile Portfolio, Open Positions, Closed Trades, Public Feed and Equity
  History. Verify exact sheet IDs/ranges, formulas as formulas and numeric cells
  as numbers. Preserve formatted date/currency parsing for website history.
  Do not confuse Open Positions R (Engine 2 review price) with Closed Trades R.
- Every cooperating scheduled Sheets writer uses the native lease/fence
  protocol in `docs/ADR_SWING_NATIVE_WRITE_FENCING.md`: lease 1030100, persistent
  fence 1030101, exact key/value guards and all financial writes in one native
  atomic batch. Re-read after acquisition, guard both records, release only the
  exact owned lease and read back all affected layers. Never delete the fence,
  steal an unexpired lease or split guards from writes. Unknown write outcome
  requires revision/lot/formula reconciliation before any retry.
- Preserve distinct DATA, PUBLICATION and DELIVERY results. A current news date
  is not completed factor research; a green cron, HTTP 200 or LIVE deployment is
  not a completed portfolio review. Public Feed time stays strict `HH:MM ET`.
- The website remains a read-only financial consumer. Both feed/history use
  the selected workbook. Keep authenticated owner/viewer boundaries, anonymous
  page redirect/API 401, EN/RU parity, no-store headers and matching snapshot
  identities. Preserve review-note/date/membership/chart refresh detection;
  never revert to ticker-only comparison or bypass the coalesced source cache.
- Keep immutable morning reference marks separate from live/last-session
  valuation and company-news overlays. Stale, invalid or incomplete quotes
  cannot manufacture fresh aggregate P&L. The November 11 reporting rebase is
  display-only and must retain its exact anchor and original source history.

## Engine 2, Render and Database Boundaries

- The Engine 2 cron is the sole pipeline/journal/email writer. The observer
  serves verified snapshots and performs read-only audits; never call its
  `stagingWorker.tick()` to repair publication. Service names containing
  `staging`/`shadow`, and legacy `productionCutover:false` flags, do not prove
  that the workbook is unused by production.
- Preserve PostgreSQL advisory locks, transaction-time prior-state/preparation
  validation, immutable session/event identities and journal/outbox recovery.
  Do not replace session locks with process-only locks or an incompatible
  connection pool. Database identity is checked against the shadow-name
  allowlist and `current_database()`; never bypass it by changing a URL alone.
- Preserve pre-open frozen research and the current 10:00–10:05 ET new-decision
  gate; the cron's wider 10:00–10:20 retry window does not permit late new
  decisions. Use the maintained NYSE/DST/holiday/early-close calendar and actual
  clock at commit. Recover committed artifacts without repricing. Legacy task
  windows remain specific to those tasks; never copy them over engine gates.
- Read actual service branch, commands, deploy SHA, auto-deploy state and
  nonsecret configuration evidence before rollout. Optional Render YAML files
  are provisioning references, not an inventory of all active services. Do not
  sync them onto production, create duplicate databases/crons or change tiers
  as an incidental repair. Keep the website's `npm start` preload chain.
- Protect `/var/data` ingress spool and private Option Proofs. A disk-backed
  website deployment can interrupt signals; use the documented safe rollout
  window. GitHub/Render deployment never installs the Windows bridge. Local
  rollout requires current file/hash comparison, controlled stop, private
  backups, reviewed dependency set, original environment and runtime/broker
  verification; never overwrite local customizations or live journals.
- Keep `VIXALE_SWING_SOURCE`, Engine 2 database/service-account settings,
  price/universe selectors, pipeline/email flags and recipient allowlist scoped
  to their actual services. Record names and redacted readiness only. A website
  source switch needs a normal deploy; Restart alone retains deploy config.
  Website financial Sheets access remains read-only. Isolated website tests
  use a separate auth/operational workbook and dedicated credentials.
- **Supabase:** no VIXALE Supabase integration is established by the inspected
  deployed branches; Engine 2 uses `pg` and the Render PostgreSQL contract.
  Do not invent a project ref, Supabase migrations/RLS setup or assume another
  connected project's database belongs to VIXALE. Any future Supabase work must
  first establish the authorized project/environment, inspect its actual
  schema/access policies and document migration, staging and rollback evidence.
  This file does not authorize a database migration or new public data access.

## Staging, GitHub Checks and Rollback

- Use isolated fixtures first, then the affected subsystem's checks in the
  operating map and actual `.github/workflows/` on the target branch. Root
  `package.json` currently has `start`, not a universal `npm test`. Respect the
  workflow's Node/Python/browser versions; do not rewrite dependencies to run QA.
- For engine changes, require the exact-head Engine 2 suite including real
  disposable PostgreSQL, replay/idempotency, formula/lease conflicts, outages,
  incomplete research, source timestamps, calendar and publication/delivery
  gates. Never run destructive integration tests against a hosted financial DB;
  preserve disposable-loopback database guards. A skipped DB test is not PASS.
- Validate website changes with all normal preloads, actual emitted JavaScript,
  EN/RU owner/viewer and anonymous flows, same-snapshot page/API checks, stale
  handling and browser refresh. Isolated staging success does not certify the
  production page. Never send synthetic trading callbacks/orders for UI QA.
- Check Actions runs/jobs at the exact PR head and target branch, including
  push/manual runs when a connector only lists PR events. Path-filtered or
  skipped workflows provide no execution evidence. Check artifacts/date/gate,
  not only the green workflow conclusion. Do not dispatch a publishing workflow
  as a read-only test: Daily Market Skim has its own content-write behavior.
  Its existing scheduled commit does not authorize direct agent pushes to main.
- Record the known-good commit/deployment, service/source settings and compatible
  data format before an authorized rollout. Verify the exact deployed SHA and
  startup/runtime evidence afterwards. Avoid duplicate manual deploys when
  main auto-deploy already started; Engine 2 services use their own manual path.
- Roll back with a narrow revert PR and the appropriate verified deploy; retain
  every real/model event, Q/R decision, journal, receipt, outbox and proof file.
  Preserve evidence-envelope decoding after compressed evidence has been stored;
  an old incompatible reader is not a safe rollback. Schema rollback needs a
  separately reviewed, non-destructive compatibility plan and verified backup.
- Website source rollback follows the [website rollout record](https://github.com/ipotrader22-cloud/tv-telegram-bot/blob/f60aad15e07dd1cbd26542ef497033b5ab728cba/docs/releases/ENGINE2_SWING_ROLLOUT.md):
  restore the approved prior source/config via normal deploy and verify both
  ranges and page/API. Label retained LEGACY data with its actual old date.
  A presentation-only fix normally needs only its code revert, not source/data
  rollback. Do not restore stale bridge journals over subsequent broker fills.

## Automated Recovery and Exception-Only Notifications

- Diagnose the failing layer: research/quotes, ledger transaction, Sheets,
  publication/cache/deploy, or delivery. Repair the root cause within authorized
  scope. A website problem must not regenerate trades or rewrite correct Sheets.
- Use bounded retries only for transient transport/timeout/429/5xx failures,
  following the component's existing cap/backoff. Re-read and deduplicate before
  any side-effect retry. Semantic drift, missing evidence, safety rejection,
  ownership conflict or expired decision window cannot be retried around.
- Resume durable state and repair missing publication components; never resend
  an ambiguous broker order, reset a ledger/lease/outbox or fabricate a fill.
  Preserve broker session/ownership/target-cancellation proofs and quarantine.
  Do not disable future schedules merely because a run failed, or re-enable
  retired duplicate writers without an authorized coordinated handoff.
- Unattended operational notifications are exception-only: a new actionable
  failure, material state change or required owner action. Deduplicate unchanged
  alerts by date/gate/lot as applicable; no routine “all clear” or no-event spam.
  This does not suppress explicitly authorized morning reports or new verified
  trade-event messages and does not claim a universal alert service exists.
- Keep Resend delivery separate from financial commits. Use the existing
  date/event idempotency key and full-date provider dedup, or the Engine 2 durable
  immutable message plan. Once a message ID exists, recover its receipt instead
  of sending again. Preserve the engine's 23-hour ambiguous-send cutoff.
  Accepted, delivered, lookup-restricted, disabled and bounced are distinct;
  a send-only credential cannot certify delivery. Never use Gmail as fallback
  or send a staging letter to customers. Do not change email flags/recipients
  merely to turn a partial result green.

## Completion Criteria

Complete the owner's requested endpoint, including an explicit PR-only or
staging-only endpoint. For documentation-only work: verify references against
current implementation, preserve valid instructions, review `git diff --check`
and the complete file list, and confirm runtime/config/workflows are unchanged.
An opened, verified documentation PR is completion when that is what was asked.

For authorized runtime/portfolio work: relevant checks pass; fresh DATA and
post-change PUBLICATION evidence reconcile exact lots, formulas, Q/R and model
math; exact deployment and actual affected user flow are verified when required;
expected DELIVERY is independently evidenced or explicitly marked disabled,
pending or blocked. Disclose partial/skipped/unverified gates. No claim of
production readiness, delivery, future monitoring or incident closure may exceed
the observed evidence. Update the handbook/current-state record when required
and report the rollback path and any remaining owner action.

---

## Final Report Format

After completing a normal task, report:

```text
Branch:
Commit:
Remote branch:
Pull Request:
Files changed:
Checks:
Handbook update required:
Production code changed:
Merged to main: YES / NO
Deployment triggered: YES / NO
Rollback:
```

Also summarize the user-visible result in plain language.

For eligible normal tasks, do not stop merely to request a second merge/deploy confirmation; continue through verified production deployment under the Standing Owner Authorization. Stop when an exception applies or the owner explicitly requests a PR-only stopping point.
