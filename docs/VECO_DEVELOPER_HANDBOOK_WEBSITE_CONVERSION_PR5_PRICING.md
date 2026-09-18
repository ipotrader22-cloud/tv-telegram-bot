# VECO Developer Handbook — Issue #123 PR 5 Pricing / Subscription Requests

**Applies to:** public `/pricing`, approved offer presentation, Day Trading trial request, and manual subscription-request routing.  
**Approved direction:** 2026-09-18 owner conversion brief.  
**Handbook update required:** YES.

## Offer contract

- Day Trading Telegram signals trial: **30 days free**;
- Single System: **$49/month**, choose Day Trading, Swing Trading, or Options;
- Three-System Bundle: **$99/month**, exactly Day Trading + Swing Trading + Options;
- three separate Single System plans: **$147/month**;
- bundle difference: **$48/month less**.

`lib/website-commercial-offer.js` remains the single public-presentation source for these constants and for manual request URLs/text.

## Trial boundary

The free trial is Day Trading Telegram signals only. It is not free viewer access and does not promise Swing or Options Telegram delivery.

The existing Telegram DM destination is reused. A click/request is not described as proof of activation. The public website does not implement an automatic trial-to-paid conversion.

## Paid-plan request boundary

There is no verified checkout/card/billing engine in the current repository. Therefore paid plan CTAs are **manual onboarding requests**, not `Pay now` actions.

The request message identifies the selected plan/system and asks for onboarding details. Any actual activation, payment, renewal or cancellation terms must come from the real onboarding process rather than invented public-site behavior.

Do not claim:
- a card is or is not required;
- automatic renewal;
- automatic Day-31 billing;
- immediate paid activation;
- a cancellation policy not implemented elsewhere.

## Viewer access

Free read-only viewer access remains a separate `/access` journey. Pricing must explicitly distinguish:

```text
viewer access != Day Trading Telegram trial != paid subscription
```

## Preload ownership

`website_conversion_pricing_refinement.js` is first in the current preload order and only transforms GET/HEAD `/pricing` HTML. It does not change backend billing, auth, or trading behavior.

## Safety boundary

No changes to `app.js`, strategy/Pine, signal/order/risk, broker execution, Sheet schemas/calculations, Telegram trade lifecycle publication, Swing Trading Lab writer/scoring, Option Journal calculation, or viewer auth.

## Validation

Before merge:
- verify 30 / 49 / 99 / 147 / 48 values come from the shared offer module;
- verify all three single-system request messages identify the selected system;
- verify bundle request identifies exactly the three approved systems;
- verify no Swing/Options Telegram-delivery promise;
- verify no fake checkout/card/autobilling language;
- verify free viewer access is separate;
- verify responsive pricing layout;
- verify branch is 0 behind fresh `main` and diff is scoped.

After merge, verify exact Render SHA, successful build/startup, first-preload order, and LIVE status.
