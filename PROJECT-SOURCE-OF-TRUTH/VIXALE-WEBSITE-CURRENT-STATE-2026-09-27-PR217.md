# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-27 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified favicon/public-page runtime state:

- **Website-facing favicon PR:** #217 — `Make canonical favicon consistent across public pages` — MERGED
- **Favicon implementation merge SHA:** `2148f6bd8758c5e2c140bd3f746658fc668c94c1`
- **QA follow-up PR:** #218 — `Align production QA after favicon rollout` — MERGED
- **Current verified main / deployed SHA:** `b190b1e5e0e4d12777897dcc0480a1bf4afc2357`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified Render deploy:** `dep-daslt5e7bikc73abmuog`
- **Verified Render deploy commit:** `b190b1e5e0e4d12777897dcc0480a1bf4afc2357`
- **Verified Render deploy status:** `live`
- **Production EN/RU Browser QA run:** `36340322533` (run #90)
- **Production QA head SHA:** `b190b1e5e0e4d12777897dcc0480a1bf4afc2357`
- **Production QA result:** **SUCCESS**
- **Canonical favicon production verification:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-26-PR208.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation/deploy commits above without changing website behavior. For operational claims, still re-check GitHub `main`, the active Render deploy, and live production QA.

## Canonical favicon

The favicon graphic remains the same existing Vixale favicon used by the main page. The canonical assets are:

```text
/favicon.ico
/favicon.png
/apple-touch-icon.png
```

The canonical browser references are cache-busted as:

```text
/favicon.ico?v=20260927
/favicon.png?v=20260927
/apple-touch-icon.png?v=20260927
```

The favicon layer now normalizes favicon declarations on HTML responses and injects the same canonical set regardless of whether a page is delivered through `res.send()` or `res.end()` / Buffer output. Legacy/conflicting favicon link tags are removed while non-favicon `<link>` tags remain intact.

This directly covers the Swing page:

```text
/trading-systems/swing-trading
```

and is route-independent for public HTML responses.

## Production favicon coverage

The dedicated production Playwright check validates the canonical favicon set and favicon asset responses on the configured public route set for both English and Russian hosts:

```text
/
/trading-systems
/trading-systems/day-trading
/trading-systems/swing-trading
/trading-systems/options
/results
/pricing
/access
/services
/about
/trading-guide
/closed-trades
/risk-management
```

For each host, the check requires the exact same three canonical favicon hrefs and verifies the favicon assets return HTTP 200 with the expected image content type and non-empty bytes.

Production QA run #90 completed successfully with:

- locale-contract: **SUCCESS**
- canonical favicon regression: **SUCCESS**
- EN/RU production browser QA: **SUCCESS**
- canonical favicon on public pages: **SUCCESS**
- owner-copy / Trading Guide live verification: **SUCCESS**
- RU Services form-control QA: **SUCCESS**

## QA follow-up from run #88

The first post-PR217 browser run (#88) reached production but failed before the favicon production step because an older Options QA assertion still expected `See How It Works ↓` to link to `#options-dashboard-preview`.

The current Options layout intentionally consolidates that CTA onto `#options-preview-card`. PR #218 updated only that stale QA expectation and also marked the dedicated favicon production step `if: always()` so future unrelated browser assertions cannot hide favicon verification.

No Options page rendering or customer-facing behavior was changed by PR #218.

## Implementation files

PR #217 changed:

```text
website_favicon.js
tests/test_favicon_consistency.js
scripts/qa-production-favicon.js
.github/workflows/production-locale-browser-qa.yml
```

PR #218 changed only QA files:

```text
scripts/qa-production-locales.js
.github/workflows/production-locale-browser-qa.yml
```

`app.js` is unchanged.

## Safety boundary

PRs #217 and #218 do **not** change:

- VECO strategy logic, signal generation, entries/exits, targets, stops, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution or bridge behavior;
- Google Sheets trading data or schemas;
- Telegram trade lifecycle behavior;
- pricing or billing;
- authentication or customer-access semantics;
- Swing/Day/Options trading calculations or authoritative data sources.

The website-facing change is favicon presentation/consistency only; PR #218 is QA-only.

## Handbook

**Handbook update required: NO.**

The change strengthens the existing favicon/public HTML preload architecture and its production QA coverage without introducing a new architecture, schema, environment variable, or data contract.

## Rollback

To roll back the favicon behavior, revert PR #217 / merge commit:

```text
2148f6bd8758c5e2c140bd3f746658fc668c94c1
```

PR #218 may be reverted separately if only the QA expectation/independent favicon verification behavior needs to be restored.
