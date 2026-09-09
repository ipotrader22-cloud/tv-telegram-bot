# VECO Developer Handbook — Website Funnel Measurement Addendum

**Applies to:** public access CTA measurement, dashboard-access lifecycle measurement, first viewer login, Services enquiries, and owner-only aggregate funnel inspection  
**Added:** 2026-09-09  
**Related routes:** `/`, `/password-request`, `/dashboard-access/verify`, `/dashboard-login`, `/services`, `/strategy-review`, `/appointment-request`, `/bot-request`, `/website-funnel/access-cta`, `/admin/funnel.json`

## Purpose

This addendum records Issue #88. The goal is to measure the customer funnel without introducing third-party tracking, storing unnecessary personal data, or changing the authoritative access/service workflows.

The measured stages are:

```text
access_cta_click
-> access_form_submitted
-> verification_email_sent
-> email_verified
-> owner_approved
-> first_viewer_login
-> service_enquiry
```

These names are a stable website analytics contract. They are not trading events and must never be mixed with VECO strategy, broker, order, Telegram, or trade-lifecycle events.

## Data-minimization contract

The funnel store contains aggregate counters only.

It must not persist:

- names;
- email addresses;
- Telegram handles;
- IP addresses;
- user-agent strings;
- cookies or session IDs;
- viewer/access codes;
- verification tokens or token hashes;
- brokerage/trading data;
- form message bodies or strategy descriptions.

`service_enquiry` may additionally keep aggregate non-personal counts for the fixed kinds:

```text
appointment
bot
strategy
```

No user-level event history is retained, so the owner should interpret stage-to-stage ratios as aggregate funnel indicators rather than a cohort-level attribution record.

## Persistence

The production Render service has an existing persistent disk mounted at:

```text
/var/data
```

The aggregate file is:

```text
/var/data/vixale_website_funnel_metrics.json
```

No new environment variable is introduced. The file is versioned internally and written atomically through a serialized in-process write queue. The current Render service runs one instance; multi-instance aggregation is outside this contract and would require a different durable counter backend.

Because the file contains aggregate counters only and no personal event records, there is no per-visitor retention window. Aggregate totals remain until the file is intentionally reset or removed by an owner-approved maintenance action.

Metric-write failure is non-blocking. It must never prevent access registration, verification, owner approval, login, or a service enquiry from succeeding.

## Authoritative server hooks

The counters reuse existing successful workflow boundaries rather than inventing parallel state:

- `access_form_submitted`: after the access request has been stored successfully;
- `verification_email_sent`: after the existing Resend send call returns successfully;
- `email_verified`: after the existing request transition to `Pending` / `Verified At` succeeds;
- `owner_approved`: after the existing owner approval creates the viewer code and updates the request to `Approved`;
- `first_viewer_login`: only when a valid viewer code has no prior `last_login_at` before the existing login-touch operation;
- `service_enquiry`: after the existing successful admin Telegram delivery for `/strategy-review`, `/appointment-request`, or `/bot-request`.

The owner-password branch of `/dashboard-login` is not a viewer-login event.

## Access CTA click

Public pages attach a first-party same-site click listener to links whose destination is exactly:

```text
/#password-access
```

The browser sends a best-effort POST to:

```text
/website-funnel/access-cta
```

The endpoint accepts no customer fields. It only increments `access_cta_click`, and ignores requests explicitly identified by `Sec-Fetch-Site` as cross-site. `sendBeacon()` is preferred with a same-origin `fetch()` fallback. Failure is intentionally silent so analytics never interferes with navigation.

This is an aggregate interest signal, not an anti-fraud or unique-visitor counter.

## Owner inspection

Authenticated owner inspection is available at:

```text
/admin/funnel.json
```

It reuses existing owner authorization and private no-store response behavior. The route returns the aggregate version/timestamps/counters only. It must never expose the underlying access-request data, access codes, tokens, or service form content.

## Implementation files

```text
lib/website-funnel-metrics.js
lib/website-funnel-source-patch.js
lib/website-funnel-client.js
website_dashboard_access_security.js
website_navigation_disclosure_refinement.js
tests/test_website_funnel_measurement.js
```

The implementation deliberately reuses existing preloads rather than adding another `-r` module to `package.json`.

## Validation

Before merge:

- `node --check` all changed JavaScript files;
- `node --check app.js` because the runtime source patch changes the compiled `app.js` behavior;
- run `tests/test_website_funnel_measurement.js`;
- run `tests/test_dashboard_access_security.js`;
- run `tests/test_navigation_disclosure_refinement.js`;
- run `tests/test_public_ia_refinement.js`;
- verify the final diff does not change Pine, bridge, TWS/IBKR, strategy/risk/order logic, Option Journal writers, or Swing automation;
- verify no secret or PII field is persisted by the metrics module.

## ADR-WEB-006 — Use first-party aggregate counters for the website funnel

**Decision:** Measure the seven-stage website funnel with first-party aggregate counters on the existing Render persistent disk. Reuse existing successful access/login/service workflow boundaries, add one no-payload CTA-click endpoint, and expose totals only through an owner-authorized no-store route.

**Reason:** The owner needs basic conversion visibility, but Vixale does not need a third-party tracker or user-level behavioral profile for this purpose. Existing access records already contain the personal data required for the actual access workflow; duplicating it into analytics would add privacy and security risk without improving the requested aggregate funnel view.

**Schema impact:** No Google Sheets schema change and no access-code schema change. One aggregate JSON operational file is introduced on the existing Render disk.

**Environment impact:** No new environment variable.

**Auth impact:** No login/session change. `/admin/funnel.json` is owner-only; the public click endpoint accepts no customer data.

**Execution impact:** None. No Pine, strategy, signal, risk, bridge, broker, TWS, or IBKR behavior is changed.

## Rollback

Revert the Issue #88 PR. The funnel endpoint/client hooks/owner JSON route disappear and the aggregate file can be left in place harmlessly or removed later by an explicitly approved maintenance action. Access requests, verification, viewer codes, service enquiries, trading state, broker state, Sheets records, and Options/Swing data require no rollback.
