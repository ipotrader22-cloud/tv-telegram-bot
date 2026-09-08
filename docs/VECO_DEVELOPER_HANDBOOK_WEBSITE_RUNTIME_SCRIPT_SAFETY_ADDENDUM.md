# VECO Developer Handbook — Website Runtime Script Safety Addendum

**Applies to:** Vixale website HTML-refinement middleware that injects inline browser JavaScript into serialized HTML  
**Added:** 2026-09-08  
**Related homepage modules:** `website_home_system_selector_refinement.js`, `website_home_live_open_pnl.js`, `website_home_performance_refinement.js`

## Purpose

This addendum records a production website gotcha discovered while verifying the PR #79 homepage presentation. It is a website/runtime-presentation rule only. It does not change strategy logic, signals, Sheets writers, auth, Telegram, bridge, TWS, IBKR, order handling, or broker lifecycle behavior.

## Problem

JavaScript `String.prototype.replace()` interprets special dollar sequences when the replacement argument is a string. In particular, `$'` means "the portion of the input after the matched substring."

That is unsafe when an HTML refinement injects a browser script as a replacement string because ordinary JavaScript source can legitimately contain strings such as:

```js
'$'
'+$'
'-$'
```

For example, this is unsafe:

```js
html.replace("</body>", `${script}\n</body>`)
```

If `script` contains a `$'` sequence, the server can splice trailing HTML into the JavaScript source before the response reaches the browser. The HTML may still render while the injected script fails to parse, making the failure look like a data-source problem.

## Required injection pattern

Inline JavaScript or other replacement content that may contain dollar sequences must be inserted with a replacement callback:

```js
html.replace("</body>", () => `${script}\n</body>`)
```

The callback return value is inserted literally and is not interpreted for replacement-string dollar tokens.

The same callback pattern should be preferred for generated script/style blocks whenever the inserted content is not guaranteed to be free of replacement-string metacharacters.

## Homepage data-presentation contract

The PR #79 Day Trading snapshot remains presentation-only. It mirrors the already-rendered authoritative homepage elements and must not create a separate performance source.

The homepage Live Open P&L remains on the existing PR #73 read path:

```text
Open Positions membership
-> existing app.js public-dashboard P&L helpers
-> existing fresh TWS quote cache / approved fallback semantics
-> aggregate only
-> GET /public-live-open-pnl.json
-> homepage Live Open P&L card
```

The public aggregate response remains limited to:

```json
{ "ok": true, "open_pnl": 0 }
```

The numeric example above illustrates response shape only; no zero or other value may be substituted when the authoritative aggregate is unavailable.

No symbol, entry, quantity, quote, bid/ask/last, broker metadata, working-order detail, owner credential, or execution control is exposed by this route.

## Regression requirement

A source-template assertion is not sufficient for inline-script refinements. Tests must inspect the **final emitted HTML** after the injection function runs and verify that:

1. dollar-bearing JavaScript literals survive unchanged;
2. trailing HTML was not spliced into the script body;
3. the extracted inline JavaScript still parses successfully;
4. existing endpoint/path and privacy contracts remain unchanged.

This is in addition to the existing route-specific functional tests.

## Rollback

Revert the corrective website PR. No data migration, Google Sheets rollback, auth rollback, trading-state rollback, bridge restart, TWS action, or IBKR action is required.
