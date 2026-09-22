# Vixale Website Handbook Addendum — Services EN/RU Structural Parity

## Purpose

This addendum records the production regression and compatibility rule for the public `/services` page on `www.vixale.com` and `ru.vixale.com`.

It is website/presentation scope only. It does not change VECO strategy logic, signal generation, order handling, risk logic, Pine, Telegram, Google Sheets trading schemas, bridge behavior, TWS/IBKR execution, authentication policy, or public performance calculations.

## Regression found by production browser QA

The first `Production EN/RU Browser QA` run after PR #169 proved that the Russian Services page did not have the same top-level `<main>` structure as the English page. The English page contained all four service forms, while the Russian page omitted the Automation and Strategy sections.

Expected canonical Services form anchors:

```text
#research-request
#appointment
#strategy-review
#bot-request
```

The failing Russian page contained only `#research-request` and `#bot-request`.

## Root cause

`website_public_ia_refinement.js` reuses form sections from the landing-page source before composing `/services`. Legacy extraction identifies several source sections by English visible heading text such as:

```text
Book a quick setup call.
Send us your trading rules.
Describe the trading bot you want.
```

On a Russian-host request the legacy landing source can already contain localized heading text before the public IA composition runs. English-text lookup then fails even though the intended form section still exists under a stable DOM id. Filtering empty extraction results silently removed whole sections from the Russian page.

**Gotcha:** never treat English presentation copy as structural identity for a locale-mirrored page. Text is content; IDs/routes are structure.

## Compatibility rule

`website_services_source_parity_fix.js` is preloaded last, immediately before `app.js`. That position is intentional: its response wrapper sees the raw landing source before `website_public_ia_refinement.js` composes `/services`.

For read-only `/services` HTML only, the compatibility layer:

1. finds the reusable Automation, Strategy, and Bot source sections by stable/legacy section IDs;
2. normalizes legacy source IDs to the canonical Services anchors where required;
3. normalizes each source section's primary `<h2>` to the legacy English heading expected by the existing public-IA extractor;
4. inserts an invisible fallback marker comment only when a structurally identified section has no usable primary heading/needle;
5. lets the existing public-IA renderer apply its normal canonical Services heading refinement and reuse the same form/backend routes;
6. lets the final Russian localization pass translate the resulting user-visible canonical Services copy.

The intermediate English heading normalization is internal composition glue, not a second customer-facing renderer. It is scoped by stable section ID and occurs before the final locale pass. A Russian response must not expose those intermediate English headings after localization. Fallback marker comments are invisible and exist only to keep a structurally identified form extractable if its heading markup is unexpectedly absent.

Canonical ID normalization:

```text
appointment / setup-call          -> appointment
strategy-review / strategy-rules -> strategy-review
bot-request / bot-builder         -> bot-request
```

## Localization rule

Services production-regression strings are complete-node translations in `website_russian_translations_regression.js`. Exact-node translation remains mandatory. Do not reintroduce substring replacement.

The Services translation coverage includes:

- conversion hero and subscription/services separation copy;
- four service-path cards and CTAs;
- Signals & Research form;
- Automation / Setup form copy;
- Strategy Review / Development form copy;
- Custom Bot / Integration form copy;
- Services boundary copy;
- the public risk-disclosure copy visible at the bottom of the page.

Form `action`, hidden backend values, IDs, classes, route paths, option `value` attributes, and user-entered values are not translated.

### Form-control presentation copy

Browser-visible form copy is not limited to `body.innerText`. Placeholders and closed `<select><option>` labels can remain English while an `innerText`-only browser test still passes.

For RU Services localization:

- `placeholder`, `aria-label`, `title`, and `alt` are presentation attributes and may be translated only by approved exact-string mappings;
- `<option>` label text is presentation copy and must be translated on the RU host;
- `<option value>`, hidden input values, form `action`, names, IDs, classes, data attributes, and submitted user values are semantics/backend contracts and must remain byte-equivalent unless separately authorized;
- production QA must inspect form-control presentation copy separately from `body.innerText`.

This distinction is mandatory. A green page-text assertion does not prove a fully localized form.

### Live-source exact-value rule

Form-control regression fixtures must mirror the **current serialized source values** that the production renderer actually emits. Do not build a localization test from remembered, historical, or visually similar placeholder copy.

PR #171 exposed this distinction: its source fixture expected `Enter email or @telegram`, while the current Services renderer emitted `@username or email`. The exact-node localizer therefore behaved correctly but had no exact match for the live value. The dedicated production browser check caught the mismatch.

A second production mismatch was caught on 2026-09-22 in the Strategy rules placeholder. The renderer emitted:

```text
Example: I want to buy when price pulls back after a strong move, enter near..., target..., stop..., only during market hours...
```

while the mapping/fixture had the visually similar but byte-different variant without the comma after `near...`. Because this layer intentionally performs exact-value replacement, that punctuation difference prevented localization and left the placeholder in English on the RU page. The fix is to keep the exact live variant in the approved mapping and keep regression/production QA aligned to the serialized source. Punctuation is part of the exact-value contract.

`website_russian_localization.js` remains the mandatory first preload and therefore the final general response transform. `website_russian_services_form_copy_refinement.js` is intentionally preloaded immediately after it. Because Express response wrappers execute in reverse middleware order, the Services safety pass sees the final downstream-refined `/services` markup first, repairs only explicitly approved live form-control presentation variants, and then hands that HTML to the canonical general RU localizer for the final locale/SEO pass.

The Services safety pass may rewrite only exact approved `placeholder` values and visible `<option>` labels on RU `/services`. It must never rewrite option `value` attributes, hidden semantic values, form actions, field names, IDs, classes, data attributes, or user-entered values.

The dedicated Chromium form-control QA is the authority for live placeholder/option behavior. A source regression is necessary but is not a substitute for that post-deploy check.

## Verification contract

For any future Services or RU-localization change:

1. run syntax checks for the parity module, final form-copy refinement, translation catalog, production QA scripts, and regression tests;
2. run `node tests/test_services_ru_parity_fix.js`;
3. run `node tests/test_services_ru_form_controls.js` using current serialized form-control strings;
4. run the existing Russian localization regression tests;
5. confirm the built Services page contains all four canonical form anchors;
6. confirm the three existing form POST routes remain unchanged:
   - `/appointment-request`
   - `/strategy-review`
   - `/bot-request`;
7. confirm option values and hidden form semantic values remain unchanged;
8. after merge/deploy, require the `Production EN/RU Browser QA` push run to pass, including `scripts/qa-production-services-form-controls.js` on desktop and mobile;
9. inspect paired desktop/mobile `/services` screenshots when visual parity is in question.

The production browser QA treats `/services` as a strict regression surface. The broad QA verifies top-level EN/RU structure and representative Russian body copy; the dedicated Services form-control check verifies current placeholders and option labels while separately asserting unchanged form actions and semantic values.

## Workflow behavior

Pull-request runs execute repository locale-contract tests only; they do not pretend to validate branch code by browsing production before the branch is deployed. Real Chromium production QA runs on `main` pushes, scheduled runs, and manual dispatch after the relevant code is serving production.

This distinction is intentional:

```text
PR -> source/syntax/regression contract
main push + Render deploy -> real production Chromium EN/RU check
```

## Rollback

Revert the Services parity/localization changes, the form-control presentation safety pass/tests, and the associated QA assertions. No trading state, broker state, customer access state, Google Sheet data, or execution lifecycle rollback is required.
