# VECO Developer Handbook — Issue #123 PR 6 Telegram Example / Access / Services

**Applies to:** public Day Trading signal example, `/access`, and `/services` conversion clarification.  
**Approved direction:** 2026-09-18 owner conversion brief.  
**Handbook update required:** YES.

## Day Trading Telegram example

The production `app.js` Prime-open formatter uses this field order when available:

```text
Vixale Prime opened <SIDE>
<SYMBOL>
Entry
Target
Stop Ref
```

PR 6 may show that structure publicly only as an **illustrative placeholder format**:

```text
🟢 Vixale Prime opened LONG

[TICKER]
📍 Entry: [entry]
🎯 Target: [target]
🛑 Stop Ref: [stop]
```

The example is not a live signal, recommendation, ticker, price, target, stop, or result. It must not call or change the production Telegram publisher.

The 30-day Telegram trial remains Day Trading only. Swing Trading and Options remain website-update products in this release.

## Access separation

`/access` keeps its existing secured request form and backend behavior. PR 6 prepends a clarification that separates:

1. **free viewer access** — read-only, email verification, manual review;
2. **30-day Day Trading Telegram trial** — Day Trading signals only;
3. **paid subscriptions** — $49 Single System / $99 Three-System Bundle.

The presentation layer must not change Turnstile, request writes, email verification, approval, viewer-code/session behavior, or protected route auth.

## Services separation

`/services` keeps its existing four bespoke-service paths and forms:

- Signals & Research;
- Automation / Setup;
- Strategy Review / Development;
- Custom Bot / Integration.

PR 6 makes explicit that these are scoped custom services and are separate from the standard $49/$99 trading-system subscription offer. Existing form actions and request schemas remain unchanged.

## Preload ownership

`website_conversion_access_services_refinement.js` becomes the first presentation preload. It handles GET/HEAD Day Trading, `/access`, and `/services` HTML only, after downstream layers have composed the final pages.

## Safety boundary

No changes to `app.js`, Telegram publication behavior, strategy/Pine, signal/order/risk, broker execution, Sheets, Trading Lab, Option Journal calculations, access-request backend, or authentication.

## Validation

Before merge:
- verify the public signal example uses placeholders only and matches the supported formatter field structure;
- verify existing access/services content is preserved rather than replaced;
- verify viewer/trial/subscription distinctions;
- verify four bespoke Services labels remain present;
- verify no Swing/Options Telegram promise;
- verify responsive stacking;
- verify branch is 0 behind fresh `main` and diff is scoped.

After merge, verify exact Render SHA, successful build/startup, first-preload order, port 10000, and LIVE.
