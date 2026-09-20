# RU Localization Regression QA — 2026-09-20

This note records the production observations that triggered the corrective PR after the first Russian localization rollout.

Observed user-facing failures:

- mixed Russian/English prose caused by fragment-level substring replacement inside longer English text nodes;
- visible homepage parity concerns between `ru.vixale.com` and `www.vixale.com`.

Confirmed code-level hazards:

- the initial locale pass translated arbitrary substrings rather than requiring a complete rendered text-node match;
- the initial SEO/host pass globally rewrote absolute `www.vixale.com` URLs outside protected code blocks, which could redirect stylesheet/image/other asset URLs to the RU host.

Corrective contract:

- translate only complete approved text nodes / supported attribute values;
- an unknown English text node stays intact instead of becoming mixed-language copy;
- preserve stylesheet, image, script, font, and other asset URLs;
- localize only explicit navigation anchors and canonical/OG/hreflang SEO URLs;
- preserve the same English homepage composition, classes, CSS, responsive behavior, data wiring, routes, forms, and live values.

This is website presentation scope only. No trading, signal, execution, broker, risk, Sheets schema, or authentication behavior changes.
