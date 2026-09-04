# VECO Developer Handbook — Website Public IA Addendum

**Applies to:** Vixale public website / navigation / Services / Pricing presentation only  
**Added:** 2026-09-03  
**Related routes:** `/`, `/trading-systems`, `/risk-management`, `/services`, `/pricing`

## Purpose

This addendum records the public information-architecture change that separates service/setup content from the main landing page and makes pricing discoverable without changing any trading or execution behavior.

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

`/pricing` is a placeholder page in the normal Vixale public visual language.

Current approved presentation:

```text
Pricing
7 Days Free
Coming Soon
```

No price table, payment flow, checkout, subscription API, billing integration, entitlement rule, or trial activation behavior is introduced by this change.

## Implementation boundary

`/website_public_ia_refinement.js` is a website-only presentation layer preloaded before `/app.js`.

It:

- transforms the English landing-page navigation;
- removes the moved Services sections from `/`;
- renders `/services` by reusing the existing landing-page service sections;
- renders the `/pricing` Coming Soon page using the existing landing shell;
- adds Risk Management to the Trading Systems upper menu.

It must not modify:

- Pine / strategy logic;
- signal generation or lifecycle rules;
- position sizing engines;
- broker / TWS / IBKR execution;
- Telegram publishing;
- Google Sheets lifecycle or schema;
- dashboard data sources;
- Options or Swing selection rules.

## Start command

The website presentation module is loaded with the existing presentation refinements:

```text
node -r ./website_trading_guide_style_refinement.js -r ./website_options_straddle_refinement.js -r ./website_trading_guide.js -r ./website_trading_systems_refinement.js -r ./website_public_ia_refinement.js app.js
```

Render should continue to use `npm start` so the presentation layers are loaded.

## Validation

Before merge/deployment:

- run `node --check website_public_ia_refinement.js`;
- run `node tests/test_public_ia_refinement.js`;
- verify the branch diff does not touch trading, bridge, TWS, Sheets, Telegram, or strategy files;
- after deployment verify `/`, `/services`, `/pricing`, `/trading-systems`, and `/risk-management` in the live runtime.

## Rollback

To roll back only this public IA change:

1. restore `package.json` without `-r ./website_public_ia_refinement.js`;
2. remove `/website_public_ia_refinement.js` and its focused test;
3. remove this addendum.

No trading-engine, bridge, TWS, Sheets, Telegram, or strategy rollback is required.
