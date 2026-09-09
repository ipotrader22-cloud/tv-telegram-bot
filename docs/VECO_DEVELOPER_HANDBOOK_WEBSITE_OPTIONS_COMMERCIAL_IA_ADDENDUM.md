# VECO Developer Handbook — Options Public Intro & Commercial IA Addendum

**Applies to:** public Options information architecture, protected Options viewer routing, `/services` commercial presentation, and customer-facing Closed Trades event labels  
**Added:** 2026-09-09  
**Related routes:** `/trading-systems/options`, `/trading-systems/options/viewer`, `/dashboard`, `/services`, `/closed-trades`

## Purpose

This addendum records Issue #74 / PR4. It is a website/public-presentation contract only. It does not change Pine, strategy rules, signals, entries/exits/stops/targets, risk, Telegram lifecycle, bridge/TWS/IBKR execution, broker orders, Google Sheets writers or schemas, Swing Trading Lab automation, Options owner entry, or dashboard authentication mechanics.

## Options public-intro contract

The canonical public Options destination is:

```text
/trading-systems/options
```

That route is a public explainer. It must be understandable before a visitor logs in and must explain the evidence available after viewer access without publishing the protected journal itself.

The public page describes the existing Options record as:

- a read-only evidence experience built from the owner-entered `Option Journal`;
- separate from Day Trading and Swing Trading records;
- capable of showing open and closed journal records after viewer access;
- accompanied by a closed-only realized Options equity view grouped by valid Exit Date;
- capable of linking to owner-provided brokerage screenshots when such protected proofs exist.

Primary public access CTA:

```text
Request Free Access -> /#password-access
```

Returning-viewer CTA:

```text
Already have access? Open Options -> /trading-systems/options/viewer
```

The public intro creates no new Options data source, no public journal API, and no public proof URL.

## Protected Options viewer contract

Protected Options content moves to:

```text
/trading-systems/options/viewer
```

This is a presentation/routing split, not a second authentication system.

The protected viewer route internally reuses the existing `/dashboard` authorization/session path. Unauthorized or expired access continues to follow the existing dashboard auth behavior. Authorized output continues to use the existing Options viewer renderer.

The protected viewer preserves:

- the same owner/viewer session accepted by the Day Trading dashboard;
- the existing Option Journal viewer table;
- the existing protected brokerage-proof links under `/dashboard/options/:id/proofs/:proofId`;
- the existing Options Equity Curve — Realized P&L;
- the existing owner-entered/manual journal explanation;
- the existing disclosure language.

The protected viewer uses the public Options overview as its canonical public URL. The new viewer sub-route does not create a separately indexed product page.

## Options data and calculation boundary

PR4 does not change the frozen Options data contract.

Authoritative worksheet/range remains:

```text
Option Journal!A:S
```

Owner write path remains:

```text
/admin/options
```

Existing proof upload/delete and protected proof view/download behavior remain unchanged.

Realized Options P&L remains derived from the existing fields and formulas:

- Credit: `(entry price - exit price) × contracts × multiplier - fees`
- Debit: `(exit price - entry price) × contracts × multiplier - fees`

Only `Closed` rows with a valid Exit Date and finite derived realized P&L enter the Options equity curve. Open/invalid rows remain excluded. No simulated replacement values are permitted.

## Services commercial-information contract

`/services` may explain how a visitor can engage with Vixale, but it must not invent standardized prices, subscription tiers, guarantees, or deliverables that have not been owner-approved.

PR4 presents four customer paths while preserving the existing Services forms:

### Viewer Access

- read-only observation/evidence path;
- free-access request uses the existing homepage flow;
- CTA: `Request Free Access -> /#password-access`.

### Signals & Research Access

- consultation clarifies what research/signal access is currently supported for the use case;
- consultation output should state supported scope, delivery/access method, and onboarding next steps;
- CTA uses the existing setup-consultation form.

### Automation Setup

- consultation may scope supported TradingView alert, webhook, and automation setup assistance;
- consultation output should provide an implementation checklist and identify any custom work that requires a quote before work starts;
- CTA uses the existing setup-consultation form.

### Custom Development

- bot/dashboard/integration work begins with requirements/scoping rather than an invented fixed price;
- scoping output should identify assumptions, deliverables, dependencies, and a quote before development begins;
- CTA uses the existing bot-builder/custom-development form and customer-facing label `Request a quote`.

Required boundary statement:

```text
Vixale does not trade or manage customer brokerage accounts.
```

This boundary distinguishes website/research/setup/development services from discretionary account management or brokerage execution.

`/pricing` remains the existing free-viewer-access explanation. PR4 does not convert it into a paid pricing table.

## Customer-facing event-label contract

Stored Closed Trades event values remain raw operational data. PR4 changes only the human-readable archive presentation.

Approved display mappings include:

```text
TP / TARGET / TAKE_PROFIT        -> Take Profit
CLOSE_STOP / FLIP_CLOSE / SL
/ STOP_LOSS                      -> Stop Loss
EOD / EOD_CLOSE /
END_OF_DAY_CLOSE                 -> End-of-Day Close
EXTERNAL_CLOSE / MANUAL_CLOSE    -> Manual Close
```

Unknown event values continue to receive a generic title-cased display label rather than rewriting the source value.

This presentation normalization must not mutate:

- `Closed Trades` worksheet cells;
- lifecycle event values;
- Telegram payloads;
- bridge/broker callbacks;
- execution semantics.

## Implementation boundary

Primary files for PR4:

```text
website_options_canonical_refinement.js
website_trading_systems_product_refinement.js
website_public_ia_refinement.js
website_closed_trades_archive.js
```

The existing preload order remains unchanged. `app.js` and `package.json` are not modified by PR4.

The Options routing change is intentionally implemented inside the existing Options canonical refinement instead of adding another authentication middleware. The Services and archive changes are implemented in their existing source generators instead of adding another final HTML-rewrite preload.

## Validation

Before merge:

- `node --check app.js`;
- syntax-check all changed website and test files;
- run `tests/test_options_canonical_refinement.js`;
- run `tests/test_trading_systems_product_refinement.js`;
- run `tests/test_public_ia_refinement.js`;
- run `tests/test_closed_trades_archive.js`;
- run existing shared-navigation/public-polish/homepage composition regressions;
- verify bare `/trading-systems/options` is not rewritten to `/dashboard`;
- verify `/trading-systems/options/viewer` is internally rewritten through `/dashboard` for existing auth/session reuse;
- verify the public Options intro performs no protected Option Journal equity read;
- verify protected proof links remain unchanged in the authorized Options viewer;
- verify Services retains the existing setup/bot/strategy forms;
- verify Services contains no invented standardized price;
- verify Closed Trades raw event values remain unchanged in the data object while rendered labels use the approved customer-facing terminology;
- verify `app.js`, `package.json`, bridge, Pine, trading, Sheets writers, Swing automation, and Options owner-entry code are absent from the diff.

After an approved merge/deployment:

1. confirm exact Render merge SHA reaches LIVE;
2. open `/trading-systems/options` without a viewer session and verify the public explainer renders;
3. verify `Request Free Access` reaches `/#password-access`;
4. verify `Already have access? Open Options` reaches the protected viewer and existing authentication behavior;
5. with an authorized viewer, verify Options equity, journal, and proof links still render;
6. verify `/admin/options` create/edit/delete continues to populate the same viewer data after refresh;
7. visually inspect `/services` desktop/mobile and all four commercial paths;
8. verify Closed Trades archive labels without changing raw ledger values.

## ADR-WEB-005 — Separate public Options explanation from protected evidence, and scope commercial work before pricing

**Decision:** The canonical Options route becomes a public explainer while the existing protected Options evidence moves to a `/viewer` sub-route that reuses the current dashboard session. Services explain four engagement paths without inventing prices, and custom work is scoped before a quote. Operational Closed Trades event codes remain raw in source data and are normalized only for customer-facing display.

**Reason:** A visitor should understand what the Options evidence is before encountering authentication. The prior bare Options URL acted as an auth boundary and hid the product explanation. At the same time, Services needed a clearer path from interest to action without making unsupported pricing promises. Human-readable event labels reduce internal jargon without changing lifecycle semantics.

**Data/schema impact:** None. No Google Sheets schema, Option Journal field, proof schema, new API, environment variable, or writer is introduced.

**Auth impact:** Existing dashboard owner/viewer authorization is reused unchanged by the new protected viewer sub-route. No second login/session system is introduced.

**Execution impact:** None.

## Rollback

Revert the PR4 merge. The prior bare Options auth-routing behavior, prior Services presentation, and prior archive labels will return. No data migration, access-code rollback, Option Journal cleanup, proof migration, Swing workbook change, trading-state rollback, broker-state rollback, Telegram action, bridge restart, TWS action, or IBKR action is required.
