# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-22 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website runtime/QA state:

- **Verified runtime implementation commit:** `f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d`
- **PR #190:** `Add Vixale favicon for browser tabs` — MERGED
- **PR #190 merge SHA:** `f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d`
- **PR #188:** `Fix unified navigation on Swing Trading page` — MERGED and retained in this runtime
- **PR #187:** `Unify public navigation and add Live Access` — MERGED and retained in this runtime
- **PR #186:** `Update Swing Trading page copy in EN and RU` — MERGED and retained in this runtime
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified runtime deploy:** `dep-daphh6rm8hqs73f7ipbg`
- **Verified runtime deploy commit:** `f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d`
- **Verified runtime deploy status:** `live`
- **Production EN/RU Browser QA run:** `35800752724` (run #50)
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-22-PR188.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For current operational claims, still re-check GitHub `main`, the active Render deploy, and the live website/production QA as required by `MASTER-INDEX.md`.

## Browser favicon deployment

PR #190 adds the Vixale browser/tab icon implementation without changing `app.js`.

Deployed favicon assets and routes:

```text
/favicon.ico             multi-size ICO: 16x16, 32x32, 48x48, 64x64
/favicon.png             64x64 browser-tab PNG
/apple-touch-icon.png    180x180 Apple touch icon
```

`website_favicon.js` is loaded from the existing Node preload chain. It serves the three assets and injects versioned favicon `<link>` elements into HTML `<head>` output idempotently.

The required localization preload order is preserved:

```text
1. website_russian_localization.js
2. website_russian_services_form_copy_refinement.js
3. website_favicon.js
```

The initial PR QA run exposed the existing rule that Russian localization must remain preload #1 and the RU Services safety pass preload #2. The favicon preload was moved to #3, after which the PR locale-contract workflow passed. The post-merge production EN/RU workflow also passed.

The Render service reports the exact PR #190 merge commit as `live`, and production QA run #50 completed successfully against the post-merge production state. The available generic web fetch could not directly retrieve the favicon binary, and the production QA workflow does not contain a dedicated favicon assertion. Therefore the deployment of the favicon implementation is verified, while an independent browser-tab icon assertion is not separately recorded here.

## Unified public navigation retained

The verified PR #190 runtime retains the previously verified unified public navigation from PRs #187–#188.

Primary navigation order:

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

Right-side actions:

```text
Log In
Live Access
```

`Live Access` routes to:

```text
/#password-access
```

The existing `/password-request` flow and Cloudflare Turnstile behavior are unchanged by PR #190.

## Homepage and Swing copy retained

The homepage action row and owner-approved Swing Trading copy from the prior verified baseline remain part of the PR #190 runtime. PR #190 changes browser branding only and does not intentionally rewrite navigation, homepage conversion copy, Swing portfolio copy, pricing, access semantics, or public trading calculations.

## Production verification details

Verification performed for the PR #190 runtime baseline:

```text
GitHub main commit:
f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d

Render deploy:
dep-daphh6rm8hqs73f7ipbg
status: live
commit: f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d

GitHub Actions:
Production EN/RU Browser QA
run id: 35800752724
run number: 50
status: completed
conclusion: success
head: main
head SHA: f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d
```

The PR-specific pre-merge QA also passed after the localization preload-order fix.

## Safety boundary

PR #190 does **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop rules, sizing, or risk;
- Swing Trading Lab scoring/selection/model portfolio logic;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram trade lifecycle publication logic;
- pricing amounts or billing calculations;
- viewer authentication/authorization semantics;
- Cloudflare Turnstile configuration or verification mechanics;
- public trading calculations or live-data source semantics.

`app.js` is unchanged by PR #190. The change is limited to browser favicon assets, favicon-serving/injection middleware, and the package preload entry.

## Handbook

**Handbook update required: NO.**

The favicon change fits the already-documented website HTML refinement/preload architecture and introduces no new trading architecture, schema, environment variable, customer-access contract, or execution behavior.

## Rollback

To roll back only the favicon feature, revert PR #190 / merge commit:

```text
f9e7cad4299426ddb5f2a8a0eb814d6d2fd5879d
```

This removes the favicon middleware/assets and package preload entry without requiring any broker, trading, Pine, Sheets, Telegram lifecycle, pricing, viewer-code, or customer-data rollback.
