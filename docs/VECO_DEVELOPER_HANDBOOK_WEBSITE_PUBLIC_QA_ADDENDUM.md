# VECO Developer Handbook — Website Public QA Addendum

**Applies to:** public website accessibility/responsive behavior, SEO metadata, crawl surfaces, and canonical-host behavior  
**Added:** 2026-09-18 — Issue #107 PR 7  
**Preferred canonical host:** `www.vixale.com`

## Purpose

Issue #107 PR 7 is the final QA/fix pass for the first-time-visitor UX epic. It does not redesign the product or replace the page-specific owners introduced by PRs 1–6. It adds a final public-response layer for verified accessibility, discoverability, and canonical-host gaps while preserving existing public navigation, access, evidence, Services, auth, and trading boundaries.

## Accessibility and responsive contract

Public HTML routes covered by the QA layer must remain usable at the audit checkpoints:

```text
360 px
390 px
768 px
1440 px
200% browser zoom / equivalent reflow
```

The implementation contract is:

- public pages receive a keyboard-visible **Skip to content** link;
- the first `<main>` becomes the stable `#main-content` target and is programmatically focusable;
- links, buttons, form controls, and explicitly focusable elements receive a strong `:focus-visible` outline;
- browser text scaling is not disabled;
- images and SVGs are constrained to the available width;
- table wrappers may scroll horizontally on constrained widths instead of forcing the viewport wider;
- important CTAs may wrap text on narrow phones rather than overflow;
- native required-field validation remains visible, and an invalid focused form control receives an additional error border/focus ring;
- `prefers-reduced-motion: reduce` suppresses nonessential transitions/animations and smooth scrolling;
- the PR 7 final pass does not remove existing page-specific responsive rules.

### Contrast correction

The audit identified `#87918d` on white as a low-contrast source-level concern for normal explanatory/chart text. The final public QA layer replaces the known public chart-label occurrence with `#5f6d67` and applies that darker token to Day Trading chart SVG text. It also keeps small evidence context text at 12 px or greater.

This is a presentation correction only. Chart values, P&L series, data points, and calculation logic do not change.

## SEO and discoverability contract

The public QA layer owns final outbound metadata for the current public routes. It replaces stale/duplicate page metadata after the existing page refinements finish rendering.

Each covered public page receives:

- one page-specific `<title>`;
- one page-specific meta description;
- `robots=index,follow,max-image-preview:large`;
- one canonical URL on `https://www.vixale.com`;
- Open Graph title, description, URL, and `website` type;
- a basic `twitter:card=summary` declaration.

No social-preview image is invented. A future `og:image` requires an approved durable public asset and should not point to an unverified/decorative placeholder.

### Sitemap and robots

`GET /sitemap.xml` serves only public canonical routes. It excludes:

- `/dashboard` and other protected viewer surfaces;
- `/admin/*`;
- `/dashboard-access/*` verification URLs;
- `/trading-systems/options/viewer`;
- legacy `/pricing` from the canonical sitemap.

`GET /robots.txt` permits the public site, disallows protected/admin/verification paths, and points crawlers to `https://www.vixale.com/sitemap.xml`.

One failed search-engine or external crawler fetch is not evidence that indexing is broken. Indexability claims require the actual HTML/crawl surface or a search-console/provider signal when available.

## Canonical host contract

The preferred canonical host remains:

```text
https://www.vixale.com
```

Issue #107 PR 7 adds an application-level safety redirect for requests that actually reach the service with host `vixale.com`:

```text
GET/HEAD https://vixale.com/<path>?<query>
-> HTTP 308
-> https://www.vixale.com/<path>?<query>
```

The redirect is intentionally limited to **GET and HEAD**. It must not redirect POST or other mutation/event traffic, including webhooks, access submissions, admin mutations, or trading-related callbacks.

This code-level redirect does not modify DNS, Cloudflare, or Render custom-domain records. If apex DNS/TLS does not route traffic to the service, that edge configuration remains a separate infrastructure dependency and must be verified/changed explicitly rather than guessed from application code.

## EN / RU consistency

The repository currently has one shared public navigation/access presentation path; Issue #107 does not introduce a separate Russian public navigation fork. Existing Russian access-verification/error responses remain owned by the secured access workflow.

PR 7 must not create host-specific navigation or access semantics. If a dedicated localized public-site implementation is introduced later, metadata/title/description localization and canonical/hreflang policy require a separate explicit design and SEO review.

## End-to-end first-time-visitor contract

The public journey established by Issue #107 remains:

```text
Home
-> understand Vixale / How It Works
-> compare Day / Swing / Options
-> inspect system-specific evidence/results
-> choose free viewer access or one of the four Services paths
-> access: submit -> verify email -> manual review -> viewer code if approved -> Log In
```

PR 7 may improve accessibility/discoverability around this journey but must not change the semantic destinations established by PRs 1–6.

## Architecture ownership

`website_public_qa_refinement.js` is intentionally the first Node preload in `package.json`. Its Express wrapper therefore receives the final outbound public HTML after the existing response refinements unwind. It owns only:

- final public SEO metadata;
- skip-link/main-target accessibility hardening;
- final public focus/reduced-motion/responsive guardrails;
- the known public chart-label contrast correction;
- `robots.txt` and `sitemap.xml`;
- GET/HEAD-only apex-to-www redirect behavior.

It does **not** own navigation semantics, system evidence calculations, access authorization, service request processing, Trading Lab data, Option Journal writes, or the trading/execution pipeline.

This module is another narrow compatibility layer in the current preload architecture. It does not resolve or supersede the separate preload/HTML-rewrite consolidation technical debt.

## Validation

Before merge:

- syntax-check `website_public_qa_refinement.js` and its focused test;
- run focused PR 7 tests for metadata, canonical URLs, sitemap, robots, skip link/main target, focus style, reduced motion, responsive breakpoints, chart token correction, and host redirect behavior;
- confirm the module is first preload and PR 6 evidence refinement remains second;
- confirm POST/other non-read traffic is not redirected by the apex-host middleware;
- inspect the PR diff for `app.js`, Pine, bridge, TWS/IBKR, auth, writer, and trading changes;
- preserve the shared public navigation and the PR 1–6 route/CTA semantics;
- inspect public pages at 360, 390, 768, and 1440 px where an interactive browser is available; source-level responsive contracts are not a substitute for claiming a visual browser verification;
- verify both `www.vixale.com` and apex `vixale.com` from an external/origin path when available; if apex DNS/TLS never reaches the application, report the host edge as **UNVERIFIED** rather than claiming the application redirect fixed DNS;
- do not infer indexing success/failure from one crawler result.

After deployment, verify the exact Render commit reaches LIVE and the startup command includes `website_public_qa_refinement.js` first.

## ADR-WEB-005 — Final public QA is an outbound guardrail, not a product rewrite

**Decision:** Issue #107 PR 7 uses one final public-response layer to enforce current public SEO metadata, accessibility guardrails, crawl surfaces, the known chart-label contrast correction, and safe canonical-host behavior. The application redirect is restricted to GET/HEAD apex requests; no DNS or mutation/event routing is changed.

**Reason:** PRs 1–6 already own the product journey and system-specific content. The final QA pass should repair demonstrable cross-cutting gaps without reopening navigation, evidence, access, Services, auth, or trading architecture.

**Data/schema impact:** None.

**Execution/trading impact:** None. No strategy, Pine, signal, order, risk, bridge, TWS/IBKR, Telegram, Trading Lab, Option Journal writer, Google Sheet schema, or protected authorization behavior changes.

## Rollback

Revert the Issue #107 PR 7 public-QA commit(s), restore the prior `package.json` preload order, and redeploy the previous confirmed website commit. No broker, trading, Pine, workbook, Option Journal, viewer-code, DNS, or customer-data rollback is required. If any DNS/custom-domain change is ever made separately, it requires its own rollback procedure and is outside this code rollback.
