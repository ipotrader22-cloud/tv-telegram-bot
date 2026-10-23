# ADR: Durable private Engine 2 staging publication

Date: 2026-10-22. Status: implemented for isolated staging; production activation blocked.

## Problem

A validated model run was disconnected from the Sheet publisher, preview and
email transport. The preview used a different fingerprint; HTML readback tried
to decode HTML as JSON. Live Google Finance marks could drift between publication
and email. Retrying an ambiguous workbook or email response risked duplicate work.

## Decision

Keep the existing production app, source workbook, trading bridge and scheduler
outside this change. A disabled-by-default worker in the separate shadow service
coordinates the complete staging sequence. It uses only the fixed private staging
workbook ID and the existing shadow database-name allowlist.

1. Independently configured Yahoo daily OHLCV and Google News coverage feed the
   versioned mechanical nine-factor assessor. Catalyst remains zero without
   independently vetted material-event evidence. Retain actual research inputs
   and raw-response hashes in the private committed evidence manifest.
2. Commit model decisions within 10:00–10:05 ET. Validate collection completion
   before committing; never manufacture a past run time. PostgreSQL transactions
   retain immutable daily holdings, closes and event identity.
3. A session advisory lock and `vixale_v2.staging_pipeline` journal retain the
   immutable artifact, Sheet receipt and email state across restarts. Canonical
   object-key serialization survives PostgreSQL JSONB reordering.
4. Acquire the native Sheet lease/fence and apply one coherent financial batch.
   Recover an ambiguous response only when the same date, fence and every planned
   cell/formula agree. Preserve closed rows exactly, including Q/R. Reject extra
   lots, formula corruption and reconciled model/cash discrepancies.
5. Preserve Google Finance in Open Positions I:L and Portfolio calculations.
   Store the frozen review price in Open Positions R (header now Review Reference
   Price). Public Feed current/return formulas reference that frozen mark. Closed
   Q/R and Public Feed B7/A33 remain unchanged. Equity C/E/F remain formulas.
6. Serve the journal's verified Sheet snapshot from the shadow API and page.
   Fetch both over uncached HTTP; compare the full API data and actual rendered
   HTML with the same immutable artifact before preparing email.
7. Email is separately disabled by default, restricted to one exact allowlisted
   staging recipient and labeled STAGING. Persist the exact plan before sending.
   Reuse its idempotency key on ambiguous retries; stop after 23 hours rather than
   risk the provider's 24-hour idempotency expiry. Verify provider message identity
   and delivery status. Accepted, delivered, bounced and complained are distinct.

The staging worker never claims production readiness. The preview uses the
observed authenticated Swing page's white header, split introduction/equity card,
four KPI cards, explanation cards and portfolio table order. It includes explicit
staging/inception status and no copied legacy positions.

## Continuous position evidence

A persisted target watermark covers every regular-session minute after the last
certified scan, including the preceding afternoon. A proven earlier target takes
precedence over today's opening stop. Its actual exit date is retained, while
its effective review date protects previously certified equity rows. Missing
minutes or more than seven days of unavailable minute history block. Missing a
review session while holding positions requires opening-stop reconciliation;
that gap cannot be silently skipped. No broker subscriptions or orders are used.

## Activation and limitations

The runtime requires explicit independent universe and sector mappings (currently
SMH/XLK/XLE), a staging service account with editor access to the private workbook,
and, for email verification, a staging Resend credential and approved recipient.
Do not reuse or disclose production secrets. Current workbook permission readback
shows only its owner. No service-account grant or real staging write was performed
in this change.

The current shadow Render web service is on the free plan and can spin down.
Its in-process timer is suitable for an awake staging test, not a guaranteed daily
scheduler. An always-running approved deployment or durable scheduled trigger,
a real contemporaneous source-backed run, actual Sheet/API/HTML readback and
confirmed staging email delivery remain cutover gates. PR #329 stays draft and
unmerged. Synthetic tests are not proof of provider delivery or production launch.

Rollback: disable the staging worker/email flags and redeploy the previous shadow
commit. Keep immutable journal and clean-epoch records; do not reset trading data
or modify the production workbook to roll back a staging code change.

## 2026-10-23 scheduler boundary

Use the standalone staging-cron.cjs entrypoint for a future separately provisioned
cron. Both 14 and 15 UTC are scheduled; the command filters the actual 10:00–10:20
ET retry window and NYSE sessions. The existing pipeline alone controls the stricter
fresh-decision window. Failures exit nonzero without leaking provider errors.
The observer can keep serving the shared journal with its writer disabled.
The cron resource and credentials are not provisioned by this code change; see the
handbook for exact setup, delivery monitoring and remaining owner credential steps.

## Read-only credential preflight

Validate the dedicated staging identity with a GET of the fixed workbook metadata
at startup, independently of writer activation. Publish only sanitized status in
health; never reveal provider exceptions or credentials. Configuration validity
is distinct from market-data completeness and successful financial publication.

## Publication-first activation scope

The owner deferred morning email on 2026-10-23. Exact verified Sheet/API/HTML
publication with EMAIL_DISABLED completes this phase; Resend is not a launch
gate. A separate paid staging cron was approved and provisioned, with writer
activation disabled until its dedicated credentials are installed. Production
website cutover still requires a real verified morning portfolio cycle.
