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

Form `action`, hidden backend values, IDs, classes, route paths, and user-entered values are not translated.

## Verification contract

For any future Services or RU-localization change:

1. run syntax checks for the parity module, translation catalog, QA script, and regression test;
2. run `node tests/test_services_ru_parity_fix.js`;
3. run the existing Russian localization regression tests;
4. confirm the built Services page contains all four canonical form anchors;
5. confirm the three existing form POST routes remain unchanged:
   - `/appointment-request`
   - `/strategy-review`
   - `/bot-request`;
6. after merge/deploy, require the `Production EN/RU Browser QA` push run to pass;
7. inspect paired desktop/mobile `/services` screenshots when visual parity is in question.

The production browser QA now treats `/services` as a strict regression surface. It verifies top-level EN/RU structure and representative Russian copy, and rejects the known English regression phrases.

## Workflow behavior

Pull-request runs execute repository locale-contract tests only; they do not pretend to validate branch code by browsing production before the branch is deployed. Real Chromium production QA runs on `main` pushes, scheduled runs, and manual dispatch after the relevant code is serving production.

This distinction is intentional:

```text
PR -> source/syntax/regression contract
main push + Render deploy -> real production Chromium EN/RU check
```

## Rollback

Revert the Services parity module, its preload entry, the Services regression translations/tests, and the associated QA assertions. No trading state, broker state, customer access state, Google Sheet data, or execution lifecycle rollback is required.
