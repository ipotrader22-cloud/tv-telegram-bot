# VECO Developer Handbook — Website Public IA Addendum

**Applies to:** Vixale public website / navigation / Services / Pricing / Trading Systems / viewer dashboard presentation only  
**Added:** 2026-09-03  
**Updated:** 2026-09-06  
**Related routes:** `/`, `/trading-systems`, `/trading-systems/swing-trading`, `/trading-systems/options`, `/swing-leaders`, `/api/swing-leaders`, `/dashboard`, `/risk-management`, `/services`, `/pricing`

## Purpose

This addendum records public information-architecture changes that separate service/setup content from the main landing page, consolidate Swing Trading onto one canonical public page, and separate the viewer-facing Day Trading dashboard from the Options journal without changing trading, research-generation, owner journal mutation, or execution behavior.

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

That route renders the existing Swing Leaders research/model-portfolio experience through the existing read-only Swing Leaders handler and service. `GET` / `HEAD /swing-leaders` permanently redirect with HTTP `301` to the canonical route, query strings are preserved, and `/api/swing-leaders` remains the existing sanitized read-only JSON endpoint.

The same Trading Lab-owned workbook, `Public Feed`, and `Equity History` ranges remain authoritative. The website adds no Swing writer, scheduler, scoring, portfolio-selection, entry/exit, or historical-equity calculation path. Trading Lab's existing morning automation remains independent of the website and continues filling the same worksheets; newly written rows are discovered through the existing server refresh/cache behavior without a website deploy.

## Canonical Options viewer page

The viewer-facing Options page is:

```text
/trading-systems/options
```

The page reuses the existing `/dashboard` authorization/session boundary. An unauthenticated request follows the existing dashboard login behavior; no second viewer password, entitlement system, cookie, or access-code store is introduced.

After authorization, the page presents the existing read-only Option Journal experience separately from the Day Trading dashboard:

- Options-specific hero and navigation;
- **Options Equity Curve — Realized P&L**;
- the existing latest-20 Option Journal viewer table, including the existing protected brokerage-proof links;
- the existing IBKR negative-price / credit explanation;
- a `Watch Systems for Free` CTA to the existing homepage registration anchor `/#password-access`.

The normal `/dashboard` presentation becomes explicitly **Live Day Trading Dashboard** and removes the viewer-facing Option Journal section, its in-page link, and the Option Straddles strategy note. The underlying owner `/admin/live` Option Journal preview is not removed.

### Options equity contract

Authoritative source: the existing `Option Journal` worksheet, range `A:S`.

No P&L field is added to Google Sheets. For each row, realized P&L continues to use the same formula as the existing application helper:

```text
Credit: (entry price - exit price) × contracts × multiplier - fees
Debit:  (exit price - entry price) × contracts × multiplier - fees
```

The equity curve uses only records where:

- `Status = Closed`;
- `Exit Date` is a valid `YYYY-MM-DD` date;
- the existing recorded fields produce a finite derived realized P&L.

Calculation:

1. group closed-trade realized P&L by `Exit Date`;
2. sum same-date results;
3. sort dates ascending;
4. calculate cumulative realized Options P&L;
5. omit invalid/missing rows rather than fabricating replacement values.

Presentation:

- X-axis: Exit Date;
- Y-axis: cumulative realized Options P&L ($);
- explicit `$0` baseline;
- tooltip: Date / Daily P&L / Cumulative P&L;
- latest cumulative value: **Total Realized Options P&L**.

This calculation is presentation-only and does not write back to `Option Journal`.

### Options data-entry safety boundary

The owner manual-entry path remains exactly the existing one:

```text
GET  /admin/options/new
GET  /admin/options
POST /admin/options
GET  /admin/options/:id/edit
POST /admin/options/:id
POST /admin/options/:id/delete
POST /admin/options/:id/proofs
GET  /admin/options/:id/proofs/:proofId
POST /admin/options/:id/proofs/:proofId/delete
```

PR B must not change `normalizeOptionTrade`, `saveNewOptionTrade`, `replaceOptionTrade`, `removeOptionTrade`, proof upload/delete behavior, `Option Journal` A:S schema, `Option Proofs` schema, or `OPTION_PROOFS_DIR` storage behavior.

The existing viewer proof route remains:

```text
GET /dashboard/options/:id/proofs/:proofId
```

and keeps its existing owner/viewer authorization checks.

## Services page contract

`/services` is presentation-only and reuses the existing landing-page service content and forms so the current form fields, identifiers, client-side handlers, and submission paths remain unchanged.

The move must not rewrite or invent form endpoints, broker integrations, APIs, fields, or backend submission behavior.

## Pricing page contract

`/pricing` was originally introduced as a placeholder page in the normal Vixale public visual language. Later website refinements may replace that placeholder under their own approved contract; this addendum does not define billing, checkout, subscription, or entitlement behavior.

No payment API, billing integration, or trading entitlement rule is introduced by the public-IA layer itself.

## Implementation boundary

Website-only presentation/routing refinements are preloaded before `/app.js`.

- `/website_swing_canonical_refinement.js` owns canonical Swing routing.
- `/website_options_canonical_refinement.js` owns canonical Options viewer presentation and Day Trading dashboard separation.
- both must load before `/website_trading_systems_product_refinement.js` so canonical detail routes are handled before placeholder page rewriting.

For Options, the canonical route is internally passed through the existing `/dashboard` route so the established dashboard authorization/session logic remains authoritative. Only after an authorized dashboard HTML response is available does the Options refinement replace the viewer presentation. Redirect/unauthorized responses are left untouched.

The Options equity curve performs one read-only `Option Journal!A:S` read through the existing Google Sheets service-account configuration. It creates no worksheet, endpoint, schema column, writer, or simulated fallback.

These website layers must not modify:

- Pine / strategy logic;
- signal generation or lifecycle rules;
- Swing Trading Lab scoring, selection, morning automation, or worksheet-writing behavior;
- position sizing engines;
- broker / TWS / IBKR execution;
- Telegram publishing;
- execution-backed Google Sheets lifecycle/schema;
- owner Option Journal mutation routes or manual entry workflow.

## Start command

Render should continue to use `npm start`. Required canonical-route ordering:

```text
... -r ./website_swing_canonical_refinement.js -r ./website_options_canonical_refinement.js -r ./website_trading_systems_product_refinement.js ... app.js
```

The exact complete preload chain is owned by `package.json` and should not be reconstructed from this addendum.

## Validation

Before merge/deployment of the Options separation:

- run `node --check website_options_canonical_refinement.js`;
- run `node --check tests/test_options_canonical_refinement.js`;
- run `node tests/test_options_canonical_refinement.js`;
- verify `/trading-systems/options` internally reuses existing dashboard authorization;
- verify unauthorized/redirect responses are unchanged;
- verify `/dashboard` no longer renders the Option Journal section or Option Straddles note;
- verify Options equity uses closed rows only, `Exit Date`, and the existing Credit/Debit P&L formula;
- verify same-date closes aggregate before cumulative P&L;
- verify brokerage-proof links remain the existing protected `/dashboard/options/...` links;
- verify `/#password-access` is the registration CTA;
- verify the branch diff does not touch `/admin/options` mutation code, Option Journal/Proof schemas, trading, bridge, TWS, Telegram, or execution logic.

After approved deployment, verify `/dashboard` as Day Trading-only and `/trading-systems/options` with an authorized viewer session on desktop and mobile.

## ADR-WEB-001 — One canonical Swing Trading page, existing data service retained

**Decision:** `/trading-systems/swing-trading` is the single canonical Swing public page and reuses the existing read-only Swing Leaders handler/service. `/swing-leaders` is retained only as a permanent redirect and `/api/swing-leaders` remains unchanged.

**Reason:** Avoid an empty transit page and duplicate public Swing pages while preserving the proven morning Trading Lab → Google Sheets → Swing Leaders read/cache path.

## ADR-WEB-002 — Options separated from Day Trading dashboard, owner journal retained

**Decision:** `/dashboard` is the viewer-facing Day Trading dashboard. `/trading-systems/options` is the viewer-facing Options page and reuses the same dashboard authorization/session. Option Journal owner mutations remain exclusively under `/admin/options...`. Options equity is derived read-only from closed Option Journal records by Exit Date using the existing P&L formula.

**Reason:** Prevent Day Trading status/performance from being confused with human-entered Options records while preserving one viewer access model and the existing manual Option Journal workflow.

**Data/execution impact:** No trading, broker, Telegram, owner journal writer, Option Journal schema, proof storage, or Swing automation change.

## Rollback

To roll back only PR B:

1. remove the `website_options_canonical_refinement.js` preload from `package.json`;
2. remove `website_options_canonical_refinement.js` and its focused test;
3. restore the prior Options routing/dashboard presentation documentation.

No Option Journal data, Option Proof file, Swing workbook, Trading Lab automation, trading-engine, bridge, TWS, Sheets schema, or Telegram rollback is required.
