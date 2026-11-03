# Engine 2 exact-head CI certification — operating runbook

The isolated workflow has no path filter. It runs on pull requests targeting the Engine 2 staging branch or main, and checks out the PR's **head SHA**, not GitHub's synthetic merge commit. The existing shadow tests and PostgreSQL integrations run on disposable PostgreSQL under Node 20. The external parity and Resend readback **unit** tests run under Node 24. This preserves the two existing Node versions for now; compatibility/unification needs a separate reviewed change.

## Offline syntax and negative regressions

    node --check engine-v2/reliability/ci-exact-head.cjs
    node --test engine-v2/reliability/ci-exact-head.test.cjs

The negative fixtures cover a previous-SHA green run, no current-head run, latest failed current-head run, in-progress/canceled/skipped runs, changed checkout SHA, multiple required workflows, and untrusted log metadata. No networking, API access, secrets, broker process, sheet write, Resend request, or production state is used.

## Evaluate actual GitHub evidence without GitHub writes

Retrieve sanitized GitHub Actions metadata using a separate read-only provider query for the **exact** 40-character PR SHA. Save a local JSON object containing:
- expected_sha: the exact GitHub PR head SHA
- checked_out_sha: the observed checkout SHA; omit/null if not independently available
- required_workflows: an array of unique workflow names to certify
- runs: objects containing only name, head_sha, status, conclusion, created_at, run_attempt and id

Then execute:

    node engine-v2/reliability/ci-exact-head.cjs --runs-file /path/to/readonly-run-metadata.json

Result codes: PASS (exit 0) means every required workflow has latest exact-head success and checkout identity matches; FAIL (exit 1) means explicit failed current-head evidence or wrong checkout; UNVERIFIED (exit 2) means insufficient evidence. A prior-head green run never certifies a later documentation-only revision.

The GitHub workflow saves engine-v2/out/reliability-ci-head.json as an artifact *after* test steps. This JSON only certifies the checkout SHA; a GitHub workflow conclusion must be independently checked before claiming completed CI success. No workflow result certifies Render runtime, cron execution, financial publication, private Sheets, API/HTML or Resend delivery.

## Workflow security and scheduling boundaries

- Actions are pinned to immutable reviewed v4 release SHAs; no pull_request_target, push-to-main, production secrets, or privileged token.
- Workflow checkout sets persist-credentials: false; permissions are limited to contents: read.
- Both jobs use isolated tests; the external-parity job does **not** run the live HTTP inspection or send email.
- workflow_dispatch becomes available only after an authorized integration to the default branch; initial verification uses the pull-request trigger.
- This separate reliability PR must **not** be merged into PR #329's branch or main automatically. Obtain the appropriate owner review, verify current Engine 2 head and reconcile concurrent commits before integration.

## Change and rollback

Files are isolated under engine-v2/reliability, docs/reliability and the new workflow. No change to staging database, existing worker, cron, Render configuration, legacy schedules, production services, Trading Lab rules or broker code. Roll back by closing/reverting the isolated PR; no financial-state rollback is required.
