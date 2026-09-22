# VECO Developer Handbook — Unified Public Navigation & Live Access Addendum

**Applies to:** Vixale public EN/RU navigation, homepage opening actions, and viewer-access routing  
**Approved direction:** 2026-09-22 owner request  
**Status:** Active website presentation contract after deployment

## Purpose

This addendum supersedes the earlier split public-navigation presentation where one header emphasized direct systems and another older header contained informational links. Public pages now use one standard header treatment, with the quieter typography and spacing of the prior informational menu.

This change is website presentation only. It does not modify trading logic, portfolio selection/ranking, market-data sources, targets/stops, TWS/IBKR, Telegram trade lifecycle, pricing calculations, viewer-code authorization, or the Cloudflare/Turnstile verification workflow.

## Standard public navigation

Every supported public page uses the same merged primary navigation order:

```text
How It Works
Trading Systems
Day Trading
Swing Trading
Options
Results
Pricing
About
Services
Help
```

Destinations:

```text
How It Works    -> /trading-systems#vx-how-to-trade-title
Trading Systems -> /trading-systems
Day Trading     -> /trading-systems/day-trading
Swing Trading   -> /trading-systems/swing-trading
Options         -> /trading-systems/options
Results         -> /results
Pricing         -> /pricing
About           -> /about
Services        -> /services
Help            -> /trading-guide
```

Right-side actions are:

```text
Log In      -> /dashboard
Live Access -> /#password-access
```

`Live Access` uses the existing public email-registration block. That form remains the existing `/password-request` viewer-access workflow and retains its Cloudflare Turnstile protection when the configured site key is present. This task changes only how users reach the existing flow; it does not change verification, manual review, viewer-code creation, expiration, or login behavior.

## Header presentation

The merged header uses the visual language of the owner-provided second reference menu:

- regular-weight, dark muted text links rather than pill-like system tabs;
- compact consistent spacing;
- `Log In` as a text action;
- `Live Access` as the green rounded primary action;
- the active page remains programmatically exposed with `aria-current="page"` and a restrained non-color-only active indicator;
- all merged links remain reachable on narrow layouts rather than being silently removed.

The same navigation HTML is localized by the existing RU localization layer. The EN/RU structure and destinations remain identical; only customer-facing labels are translated.

## Homepage opening actions

The homepage hero action row is:

```text
Telegram Signals  -> existing Day Trading Telegram trial destination
Live Access       -> /#password-access
View Trading Results -> /results
```

The previous `Get 30 Days Free` hero label becomes `Telegram Signals`. The underlying Telegram destination and approved 30-day Day Trading trial semantics do not change.

`Live Access` is an additional button using the existing hero button style and routes to the existing Cloudflare-protected viewer email-registration block.

The supporting line remains:

```text
30-day free trial of Day Trading Telegram signals.
```

No Swing or Options Telegram delivery is introduced by this label change.

## Scope boundary

This addendum does **not** authorize changes to:

- VECO/Pine strategy behavior;
- entry, exit, stop, target, risk, sizing, or signal timing;
- Swing Trading Lab selection/ranking or model calculations;
- Option Journal calculations or owner-entry behavior;
- Google Sheets schemas or writers;
- TWS/IBKR/local bridge execution;
- Telegram trade lifecycle publication;
- pricing amounts or billing behavior;
- viewer authentication/authorization or Cloudflare Turnstile settings.

## Validation

Before merge:

- syntax-check the shared navigation and homepage conversion refinements;
- run unified navigation regression including EN/RU labels and destinations;
- run homepage action regression confirming `Telegram Signals`, `Live Access`, and `View Trading Results`;
- run existing owner-copy, Russian localization, Services, and Trading Guide regressions;
- review the complete diff for trading/backend/auth/data-source changes.

After merge/deployment:

- verify the exact merge SHA reaches Render `live`;
- run EN/RU production browser QA at desktop and mobile widths;
- verify the standard merged navigation on every configured public route;
- verify `Live Access` resolves to `/#password-access` and the existing registration block;
- verify `Telegram Signals` keeps the existing Day Trading Telegram trial destination;
- verify the prior Swing owner-copy production regression remains green;
- update Website Source-of-Truth only after direct deployment and browser-QA verification.

## Rollback

Revert the implementation PR. No trading, broker, Sheets, Telegram lifecycle, pricing, or customer-access data rollback is required.
