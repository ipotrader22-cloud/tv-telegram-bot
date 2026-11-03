# Engine 2 reliability WP3 — isolated read-only CI investigation pilot

Date: 2026-11-03. Experimental workflow only. **No autonomous code modification, PR merge, staging deploy, production intervention or email send.** This is a narrow agent-safety preparation, not general AI autopatching.

## Real historical failure and independent evidence

- GitHub historical [failed Engine 2 Shadow Tests run 41548502444](https://github.com/ipotrader22-cloud/tv-telegram-bot/actions/runs/41548502444), SHA a52ff02fae4f1c78930862172be18560c01fca08, November 2 at 23:50 UTC. Job shadow-rules failed in its test step; 419 passed, 1 failed.
- Failing test was in engine-v2/google-quote-provider.test.cjs near line 74: Google cycle closes first using each stock source time, not a common fabricated cutoff. Sanitized error code CURRENT_OPENING_COVERAGE_INCOMPLETE.
- Exact failing revision's test constructed a carried position from the preceding session, then called proposeDelayed without current-session opening observations. That is inconsistent with the newer safety guard: a carried lot requires an exact sourced 09:30 RTH OPEN at the new session.
- Independent review of later source at Engine 2 draft head 7a9e92d6078b1abb91cb64d1e9eed2e7908c5081 shows the same test supplies a correctly dated and timestamped opening fixture, with minuteET 09:30, confirmed true, exact source identity and unchanged Google quote price-policy inputs. This is a **test-fixture correction**, not a relaxation of production 09:30 opening controls.
- Later [exact-head Engine 2 Shadow Tests run 41618605809](https://github.com/ipotrader22-cloud/tv-telegram-bot/actions/runs/41618605809) completed successfully at SHA a14bf63e03722574dc8a47009a538f4c4343af5c with 425 passing tests and zero failures. That newer head includes the corrected fixture; it does not prove the November 3 market session succeeded.

## Read-only pilot contract

engine-v2/reliability/ci-investigator.cjs accepts **offline sanitized metadata only**: source SHA, failed GitHub run ID/status, fixed test identity and fixed error code. No raw arbitrary logs, comments, repository write credential, Render or Resend token are required. The investigator returns a bounded diagnostic hypothesis and a recommendation to adjust only the known test fixture; no source code is edited by it.

Security negatives verify that instructions embedded in external logs are ignored and never echoed, unrelated errors remain unknown, bad source identity is rejected, logs over 16 KiB are blocked, and attempts stop at one. The test-fix recommendation explicitly forbids app.js, bridge, Pine, delayed model cycle and ledger changes. Report contents are a hardcoded safe vocabulary rather than log text.

Run:

    node --check engine-v2/reliability/ci-investigator.cjs
    node --test engine-v2/reliability/ci-investigator.test.cjs

The experimental CI workflow executes the above in a PR without secrets and without privileged GitHub scopes. The analyst who reviewed these sources is AI-assisted, but this script does **not** invoke an autonomous LLM. A trusted provider/runner for future automated failed-CI log retrieval and agent reasoning is not yet deployed or authorized. Do not claim a live autonomous repair demonstration.

## Next gate beyond this pilot

A separate controlled agent trial may be considered only after failure-log sanitization and permission controls can be enforced by a supported runner. It must use workflow_run on a non-production disposable workflow or an isolated manually selected failed run, readonly permissions, fixed attempt/token budgets, prompt-injection tests, restricted code-path patch proposals, independent CI, no auto-merge, and never have trading/production secrets. Creating or enabling such an agent is outside this read-only PR.

**Outcome:** Historical root-cause hypothesis independently supported by source diff and later passing CI, injection-negative tests available. Not proof of real market staging or a live autonomous agent.
