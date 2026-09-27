# Work Website Redesign — Staging Architecture Note

**Date:** 2026-09-27  
**Issue:** #213  
**Branch:** `design/work-redesign-staging-20260927`  
**Production status:** NOT MERGED / NOT DEPLOYED TO VIXALE.COM

## Problem statement

Work supplied a September 2026 design-and-copy blueprint for a premium public Vixale website. The owner requested an implemented version on an isolated Render host for review, with no merge or deployment to `vixale.com`.

## Source-of-truth check

The mandatory current-state manifest records PR #208 / `a2e23c9fc6c7cc783ce0fde7e9a78cac7804294c`, but the live GitHub `main` branch and production Render service were re-checked on 2026-09-27 and were on PR #212 / `969aaa1c82761f199b7bcf4ecb852327d557e4bb`. This is a **CONFLICT / stale manifest** condition. The staging branch was created from the verified live `main` commit and this note does not rewrite the production manifest.

## Decision

Implement the Work blueprint as a single opt-in public HTML refinement layer, `website_work_redesign_preview.js`, preloaded immediately after `website_russian_localization.js`.

The layer is inert unless:

```text
VIXALE_WORK_REDESIGN_PREVIEW=true
```

This flag is intended only for a separate Render staging service. Without the flag, the module registers no Express middleware and existing public output remains unchanged.

The placement immediately after Russian localization preserves the existing reverse response-transform ordering: all existing website refinements run first, then the Work redesign post-processes the final public HTML, then Russian localization remains the final translation pass. The preview module extends the existing translation map for its primary navigation and headline strings.

## Public scope

The preview layer is route-scoped to public GET/HEAD surfaces only:

- `/`
- `/trading-systems`
- `/trading-systems/day-trading`
- `/trading-systems/swing-trading`
- `/trading-systems/options`
- `/results`
- `/pricing`
- `/services`
- `/about`
- `/access`
- `/trading-guide`
- `/closed-trades`
- `/risk-management`

It does not run on `/dashboard`, `/admin/*`, `/tv`, webhook routes, APIs, protected Options viewer mutations, or any broker/trading route.

## Design and copy behavior

The preview applies Work's bright editorial design tokens (`#F7F8FA`, `#101828`, `#475467`, `#D8DEE7`, `#101820`, `#087F5B`, `#B42318`), ~1200px layout width, 40/60 hero split, tabular data styling, restrained interaction treatment, mobile stacking, visible focus, and `prefers-reduced-motion` handling.

The homepage preview implements the Work hierarchy:

```text
Hero + Day/Swing/Options product tabs
-> system selection
-> clearly labeled Telegram format example
-> system-specific results previews
-> three-step getting started
-> $49 Single System / $99 bundle pricing
-> founder introduction
-> six FAQs
-> final Day Trading trial CTA
```

Primary navigation becomes:

```text
Day Trading | Swing Trading | Options | Results | Pricing
Log In | Get 30 Days Free
```

The Day Trading, Swing Trading, Options, Pricing, Results, Services, and About pages receive the approved Work headline/copy direction while retaining their existing data/auth/form implementations.

## Data truth and access boundaries

The redesign does not calculate, synthesize, substitute, or cache trading values. Homepage product-preview metrics continue to use the existing mirror/source machinery. Swing preview continues to use the existing public Swing feed. Unavailable values remain unavailable.

The Telegram block is explicitly labeled `Format example · not a historical trade` and contains placeholders only; it does not invent a ticker, price, date, or result. It must be replaced by an approved genuine redacted historical sequence before any production launch if one is available.

Existing destinations remain authoritative:

- Day Trading 30-day trial: established Telegram DM request URL.
- Paid plan requests: established Telegram onboarding request URLs.
- Viewer access: existing `/access` / access security workflow.
- Login: existing `/dashboard`.
- Options protected records: existing protected viewer boundary.

No automatic checkout, activation, billing, renewal, cancellation, refund, or instant-access behavior is invented.

## Trading / execution impact

None. This patch does not modify VECO strategy logic, TradingView/Pine, signal generation, Telegram lifecycle publication, bridge code, TWS/IBKR execution, risk logic, Swing Trading Lab selection/writer behavior, Option Journal writes, or Google Sheets trading schemas.

## Files touched

- `website_work_redesign_preview.js` — opt-in public presentation layer.
- `package.json` — preload wiring only.
- `tests/test_work_redesign_preview.js` — targeted presentation and isolation checks.
- this architecture note.

`app.js` is intentionally unchanged.

## Verification plan

- `node --check website_work_redesign_preview.js`
- `node --check tests/test_work_redesign_preview.js`
- run `node tests/test_work_redesign_preview.js`
- parse `package.json`
- inspect GitHub diff from verified main baseline
- deploy only the feature branch to a separate Render service with the preview flag enabled
- inspect desktop and mobile public pages, Day/Swing/Options tabs, CTA destinations, missing/stale data behavior, EN/RU flow, keyboard focus, and reduced-motion behavior
- confirm production Render service remains on `main` and no production deploy is triggered

## Rollback

Suspend/delete the separate staging Render service and delete or revert the feature branch/PR. Because production `main` is not merged and the preview is opt-in, production requires no code, broker, Sheet, viewer-code, Option Journal, or trading-data rollback.

## Canonical handbook status

**Handbook update required: YES.** This note contains the ADR-ready content for the staging branch. Before any merge to `main`, the corresponding decision must be appended to `/docs/VECO_DEVELOPER_HANDBOOK.md` in the same approved production patch. The current connector write interface replaces complete files rather than applying partial patches, so the canonical handbook is intentionally not rewritten from a truncated remote read during this staging-only task.
