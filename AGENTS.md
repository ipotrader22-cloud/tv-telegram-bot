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
TradingView: VX_FIONA_PULLBACK_HTF_v1.3
Variant: FIONA_PULLBACK_HTF_ATR_TARGET

Fiona
TradingView: VX_FIONA_LIMIT_PULLBACK_LIVE_v1.0
Variant: FIONA_LIMIT_PULLBACK_ATR_TARGET
```

Classification precedence is architecture-sensitive:

1. Fiona Limit by its specific variant.
2. Shrek / generic Opposite Flip.
3. Elvis / EMA Pullback.
4. Older Vixale families.

Fiona and Shrek share a generic strategy identifier. Never move generic Shrek classification ahead of the specific Fiona classifier.

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
