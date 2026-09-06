# VECO Developer Handbook — Website Public IA Addendum

**Applies to:** Vixale public website / navigation / Services / Pricing / Trading Systems presentation only  
**Added:** 2026-09-03  
**Updated:** 2026-09-05  
**Related routes:** `/`, `/trading-systems`, `/trading-systems/swing-trading`, `/swing-leaders`, `/api/swing-leaders`, `/risk-management`, `/services`, `/pricing`

## Purpose

This addendum records public information-architecture changes that separate service/setup content from the main landing page, make pricing discoverable, and consolidate Swing Trading onto one canonical public page without changing trading, research-generation, or execution behavior.

## Main navigation contract

On the English main landing page:

- remove `Risk Management` from the main top navigation;
- replace `Why It Makes Sense` with `Services`, linking to `/services`;
- replace `Creators` with `7 Days Free`, linking to `/pricing`;
- retain the other existing main navigation items.

The existing `/risk-management` route remains available. It is not deleted or redirected.

## Trading Systems navigation contract

The `/trading-systems` upper menu includes a visible `Risk Management` link to `/risk-management`.

This moves Risk Management discoverability from the main landing navigation into the Trading Systems context. It does not change the Risk Management page content or any risk engine / sizing logic.

## Canonical Swing Trading route

The canonical public Swing Trading page is:

```text
/trading-systems/swing-trading
```

That route must render the existing Swing Leaders research/model-portfolio experience through the existing read-only Swing Leaders handler and service. It must not maintain a second placeholder/transit page.

Backward compatibility:

- `GET` / `HEAD /swing-leaders` permanently redirect with HTTP `301` to `/trading-systems/swing-trading`;
- query strings are preserved by the redirect;
- `/api/swing-leaders` remains the existing sanitized read-only JSON endpoint;
- no new public Swing API is introduced.

Data-flow contract:

- the canonical page reuses `createSwingLeadersHandlers({ getSheetsClient })` and the existing Swing Leaders service/cache path;
- the same Trading Lab-owned workbook, `Public Feed`, and `Equity History` ranges remain authoritative;
- the website adds no Swing writer, scheduler, scoring, portfolio-selection, entry/exit, or historical-equity calculation path;
- Trading Lab's existing morning automation remains independent of the website and continues filling the same worksheets;
- newly written Public Feed snapshots and newly appended Equity History rows continue to be discovered by the existing server refresh/cache behavior without a website deploy;
- stale/fail-closed behavior remains owned by the existing Swing Leaders service.

This route consolidation must not modify the owner-managed `Option Journal` workflow or any `/admin/options` mutation route.

## Services page contract

`/services` is presentation-only and reuses the existing landing-page service content and forms so the current form fields, identifiers, client-side handlers, and submission paths remain unchanged.

The Services page contains:

1. the complete `What can we help you with?` six-card section:
   - Watch;
   - Signals;
   - Automation;
   - Setup;
   - Research;
   - Custom bot;
2. the complete `Book a quick setup call.` section;
3. the complete `Describe the trading bot you want.` section;
4. the complete `Send us your trading rules.` section.

Those four blocks are removed from the English main landing page after being moved to `/services`.

The move must not rewrite or invent form endpoints, broker integrations, APIs, fields, or backend submission behavior.

## Pricing page contract

`/pricing` was originally introduced as a placeholder page in the normal Vixale public visual language. Later website refinements may replace that placeholder under their own approved contract; this addendum does not define billing, checkout, subscription, or entitlement behavior.

No payment API, billing integration, or trading entitlement rule is introduced by the public-IA layer itself.

## Implementation boundary

`/website_public_ia_refinement.js` and other website-only presentation/routing refinements are preloaded before `/app.js`.

The Swing consolidation uses `/website_swing_canonical_refinement.js` as a narrow routing/presentation layer. It must load before `/website_trading_systems_product_refinement.js` so `/trading-systems/swing-trading` can be routed to the existing Swing Leaders page handler before the Trading Systems placeholder transformer rewrites the request.

These website layers may:

- transform public navigation and presentation;
- render presentation-only public pages;
- route the canonical Swing page to the existing read-only Swing Leaders handler;
- redirect the legacy Swing page to the canonical URL.

They must not modify:

- Pine / strategy logic;
- signal generation or lifecycle rules;
- Swing Trading Lab scoring, selection, morning automation, or worksheet-writing behavior;
- position sizing engines;
- broker / TWS / IBKR execution;
- Telegram publishing;
- Google Sheets lifecycle or schema;
- dashboard data sources;
- owner Option Journal mutation routes or manual entry workflow.

## Start command

Render should continue to use `npm start` so the presentation layers are loaded. For the Swing canonical routing, the ordering requirement is:

```text
... -r ./website_trading_guide.js -r ./website_swing_canonical_refinement.js -r ./website_trading_systems_product_refinement.js ... app.js
```

`website_swing_canonical_refinement.js` must remain before `website_trading_systems_product_refinement.js`; the rest of the live preload chain is owned by `package.json` and should not be reconstructed from this addendum.

## Validation

Before merge/deployment of the Swing consolidation:

- run `node --check website_swing_canonical_refinement.js`;
- run `node --check tests/test_swing_canonical_route_refinement.js`;
- run `node tests/test_swing_canonical_route_refinement.js`;
- verify `/trading-systems/swing-trading` internally reaches the existing `/swing-leaders` page handler;
- verify `/swing-leaders` returns HTTP 301 to the canonical route;
- verify `/api/swing-leaders` is unchanged;
- verify the package preload order places the canonical refinement before the Trading Systems product refinement;
- verify the branch diff does not touch `lib/swing-leaders.js`, `lib/swing-leaders-core.js`, Options admin/manual-entry code, trading, bridge, TWS, Telegram, or Google Sheets schema code.

After an approved deployment, verify the canonical Swing page, legacy redirect, latest Trading Lab snapshot, Equity History chart, and mobile/desktop rendering in the live runtime.

## ADR-WEB-001 — One canonical Swing Trading page, existing data service retained

**Decision:** `/trading-systems/swing-trading` is the single canonical Swing public page and reuses the existing read-only Swing Leaders handler/service. `/swing-leaders` is retained only as a permanent redirect and `/api/swing-leaders` remains unchanged.

**Reason:** Avoid an empty transit page and duplicate public Swing pages while preserving the proven morning Trading Lab → Google Sheets → Swing Leaders read/cache path exactly as it operates today.

**Data/execution impact:** None. No Swing writer, Trading Lab automation, Google Sheets range/schema, Options manual journal workflow, signal path, broker path, or execution logic changes.

## Rollback

To roll back only the Swing canonical-route consolidation:

1. remove the `website_swing_canonical_refinement.js` preload from `package.json`;
2. remove `website_swing_canonical_refinement.js` and its focused test;
3. restore the prior Swing route documentation.

The original `/swing-leaders` page handler and `/api/swing-leaders` endpoint remain in `app.js`, so rollback does not require a Swing workbook, Trading Lab automation, Options journal, trading-engine, bridge, TWS, Sheets, or Telegram rollback.
