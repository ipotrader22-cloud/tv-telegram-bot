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

---

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
   diff, push the feature branch, open a Pull Request, and stop before merge
   unless the owner explicitly authorizes the next production step.

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
12. Stop before merge.

Codex may commit, push the feature branch, and create the Pull Request as part of the same task.

Codex must **never** merge into `main`, push directly to `main`, or trigger a production deployment unless the user explicitly requests that action.

GitHub or operating-system permission prompts may still require the user to click **Allow once**.

---

## Non-Negotiable Safety Rules

### Never bypass execution-first

VECO must not publish an OPEN or CLOSED trade until TWS confirms the real broker fill.

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

Current production systems:

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
→ stop before merge
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
- merge without explicit approval;
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

Do not merge the PR.

---

## Render Rules

The production Render service tracks the repository production branch.

A merge or push to `main` may trigger Render Auto-Deploy.

Therefore:

- feature-branch pushes are allowed;
- Pull Request creation is allowed;
- merge to `main` requires explicit approval;
- do not use or reveal the Deploy Hook;
- do not claim Render is Live without checking deployment status and startup logs.

Codex does not need to press a Render deploy button when Auto-Deploy is enabled for `main`.

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
Merged to main: NO
Deployment triggered: NO
Rollback:
```

Also summarize the user-visible result in plain language.

Stop after creating the Pull Request unless the user explicitly instructs otherwise.

<!-- trading-doc-maintenance-v1 -->
## Documentation maintenance


After a meaningful change to code behavior, paths, configuration locations, versions, schemas, dependencies, startup procedures, validation results or known limitations, update the owning project's documentation before declaring the task complete. This is a completion rule for agents working on a task, not a background watcher.

1. Read existing AGENTS.md, handbook, master index and the current manifest they select. Preserve existing instructions and project-specific safety/approval boundaries.
2. Recheck authoritative source relevant to each claim. Keep repository/source, local installation, observed running process, deployed service and end-to-end validation separate.
3. Update the affected existing handbook/state document; use PROJECT-MEMORY only for its designated role. Do not create competing authoritative copies. Existing dated manifests remain historical unless explicitly superseded.
4. In CURRENT-STATE.md record version/commit, exact paths, verification date and method, tests actually run and their results, and unresolved issues. Mark inherited evidence as previously recorded and label unknowns UNVERIFIED or NOT RUN. A hash or syntax check does not prove live trading behavior.
5. Update MASTER-INDEX.md when locations or ownership change and append meaningful history to CHANGELOG.md. For repository work follow the existing branch/commit/PR rules; no merge or deployment is authorized by this policy.
6. Keep unrelated trading systems separate. Never run broker-affecting code, place orders, restart live systems, enable alerts or alter secrets merely to maintain documentation.
7. Do not export credentials, .env, service-account JSON, session/browser profiles, logs containing secrets, workbook records or broker/customer data. Export only the explicit Markdown allowlist in the central registry.
8. Regenerate the ChatGPT upload package using the central export-docs.py utility after relevant documentation changes. Review the result. An upload bundle is a timestamped snapshot, not an automatic live mirror.
9. Automatic delivery remains disabled until exact project mapping and a supported authenticated upload/replace method have been verified end-to-end. A successful local export is NOT a successful upload.
10. Finish by stating docs changed or why no update was needed, tests/evidence, unresolved issues, and export/upload status. Never manufacture new validation dates for old results.

Central registry and exporter: C:\Users\tradi\Documents\Trading-Documentation.

Local documentation entry points:
- `PROJECT-MEMORY/veco/MASTER-INDEX.md`
- `PROJECT-MEMORY/website/MASTER-INDEX.md`

Do not overwrite these records with stale chat or downloaded copies. Existing rules above remain in force.
