# Vixale Website Handbook Addendum — Russian Locale Mirror

## Purpose

The Russian public site at `ru.vixale.com` must remain a presentation-identical mirror of the canonical English Vixale website while rendering the user-facing copy in professional Russian.

This addendum records the host-aware localization architecture added for that requirement. It is website/presentation scope only. It does not change VECO strategy logic, signal generation, order handling, risk calculations, Pine logic, Telegram delivery, bridge/TWS/IBKR execution, Google Sheet schemas, public performance calculations, authentication policy, or the authoritative live-data sources.

## Architecture

`website_russian_localization.js` is preloaded **before** the existing website refinement middleware in `package.json`.

The ordering is intentional. Existing website modules build/refine the English HTML first during response delivery. The Russian middleware owns the earliest `res.send()` wrapper, so its translation pass runs after the later English presentation refinements have produced the final HTML. This lets `ru.vixale.com` reuse the same final DOM, classes, CSS, responsive behavior, forms, links, and live-data wiring instead of maintaining a second renderer.

The localization layer is activated only when the request host is `ru.vixale.com`. `www.vixale.com` remains unchanged.

## What the locale layer may change

For Russian-host HTML responses, the layer may change only presentation/locale material:

- visible HTML text nodes;
- `placeholder`, `aria-label`, `title`, `alt`, and metadata `content` attributes;
- the document language to `lang="ru"`;
- absolute internal `www.vixale.com` / `vixale.com` presentation links to `ru.vixale.com`;
- Russian canonical/OG URLs and `hreflang` metadata.

The translation catalog is split across `website_russian_translations_1.js` through `website_russian_translations_10.js` for maintainability. Together, the catalog covers the public homepage, Trading Systems hub, Day Trading, Swing Trading, Options, Results/access language, Pricing/free-watch flow, Services, About, Trading Guide, Risk Management, Closed Trades, login/access labels, common dashboard/result labels, disclosures, and the currently published Swing research-note/status vocabulary.

## What the locale layer must not change

The following are protected from text translation:

- `<script>` contents;
- `<style>` contents;
- `<pre>` and `<code>` contents;
- `<textarea>` contents;
- form/backend `value` attributes;
- IDs, classes, `data-*` attributes, route paths, API payloads, ticker symbols, prices, P&L numbers, dates, quantities, and other live numeric data.

Private/operational prefixes such as `/admin`, `/tv`, `/ib/`, `/api/`, and `/webhook` are excluded. Non-HTML responses are not transformed.

The middleware is also applied to user-facing HTML returned after POST requests, so Russian access/service form confirmation or error pages do not fall back to English.

## Data-source rule

Localization is display-only. The Russian host must continue to consume the same authoritative data endpoints and rendered values as the English host. It must never create translated fallback values, synthetic performance, altered calculations, translated API payloads, or a second data source.

Free-form source text that changes over time (for example Swing research notes) should be added to the display translation catalog when the English source introduces materially new wording. The source record itself remains unchanged.

## Copy-maintenance rule

When English public copy is added or materially changed, the same PR should update the Russian translation catalog and the Russian localization regression fixture when that copy can appear on `ru.vixale.com`.

Do not fork CSS or duplicate full page renderers for Russian unless the owner explicitly changes the architecture. The default is one English canonical renderer plus the final host-aware localization pass.

## Verification

For changes to the locale layer:

1. Run `node --check website_russian_localization.js`.
2. Run `node --check tests/test_russian_localization.js`.
3. Run `node tests/test_russian_localization.js`.
4. Confirm `package.json` preloads `website_russian_localization.js` before the other website refinement modules.
5. Confirm `www.vixale.com` samples remain byte-for-byte unchanged by the locale middleware.
6. Confirm `ru.vixale.com` samples set `lang="ru"`, Russian canonical/metadata, translated visible copy, and preserved scripts/styles/form values.
7. After an explicitly approved merge/deploy, visually compare representative desktop and mobile pages on both hosts and confirm layout parity.

## Rollback

Remove the Russian localization preload from `package.json` and revert `website_russian_localization.js`, the `website_russian_translations_*.js` catalog files, plus its test/addendum. No broker state, trading state, performance ledger, authentication database, Google Sheet, Pine, Telegram, TWS, or IBKR rollback is required.
