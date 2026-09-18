# VECO Developer Handbook Addendum — Day Trading Inline Script Injection Gotcha

Date: 2026-09-18

## Scope

This addendum records the production website gotcha discovered after the PR #139 homepage/Results chart fix.

The dedicated Day Trading product page at `/trading-systems/day-trading` uses the same inline-script emission pattern as the homepage and Results page. Its script contains currency literals such as `'+$'` and `'-$'`.

When an inline script containing those literals is inserted with:

```js
html.replace("</body>", `${script}\n</body>`)
```

JavaScript `String.replace()` interprets `$'` inside the replacement string as a special replacement token. That can corrupt the emitted script before it reaches the browser, leaving metrics at their loading placeholders and preventing the realized-P&L SVG from rendering even while `/public-performance.json` is healthy.

## Required pattern

Inline script HTML containing dollar-sign replacement sequences must be inserted through a callback replacer so the script bytes are preserved literally:

```js
html.replace("</body>", () => `${script}\n</body>`)
```

## Regression rule

Every public page with an injected inline chart/runtime script must have an emitted-HTML regression that:

1. runs the real injector against an HTML fixture;
2. extracts the emitted `<script>` by ID;
3. verifies expected money-format literals are still present; and
4. compiles the emitted JavaScript with `new Function(...)` or equivalent syntax validation.

The regression must cover the dedicated Day Trading page in addition to the homepage, Results, and PR7 final homepage chart scripts.

## Safety boundary

This is presentation/runtime-script emission only. It does not change `/public-performance.json`, `/public-live-open-pnl.json`, P&L calculations, Google Sheets reads/writes, authentication, Telegram, Pine, bridge/TWS/IBKR execution, strategy logic, risk, entries, exits, stops, targets, or signal timing.
