# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-23 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website runtime/QA state:

- **Verified runtime implementation commit:** `9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f`
- **PR #194:** `Route Options Results hero CTA to viewer` — MERGED
- **PR #194 merge SHA:** `9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f`
- **PR #192:** `Add Live Access CTA to Day Trading hero` — MERGED and retained in this runtime
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified runtime deploy:** `dep-daprl9mq1p3s73f4a9f0`
- **Verified runtime deploy commit:** `9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f`
- **Verified runtime deploy status:** `live`
- **Production EN/RU Browser QA run:** `35855894255` (run #55, attempt 2)
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-23-PR192.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For current operational claims, still re-check GitHub `main`, the active Render deploy, and the live website/production QA as required by `MASTER-INDEX.md`.

## Options hero CTA destination

On:

```text
/trading-systems/options
```

the hero button:

```text
View Options Results
```

now routes to:

```text
/trading-systems/options/viewer
```

The lower evidence link labeled `Options Results →` intentionally remains on:

```text
/results#options
```

The change is implemented by `website_options_results_link_refinement.js`, registered in the existing Node preload chain immediately before `website_conversion_system_pages_refinement.js`. The refinement is scoped to GET/HEAD requests for the Options system page and rewrites only the hero CTA with the exact `View Options Results` label.

## Production verification details

Verification performed after PR #194 merge:

```text
GitHub main commit:
9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f

Render deploy:
dep-daprl9mq1p3s73f4a9f0
status: live
commit: 9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f

GitHub Actions:
Production EN/RU Browser QA
run id: 35855894255
run number: 55
run attempt: 2
status: completed
conclusion: success
head: main
head SHA: 9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f
```

The first browser job attempt was cancelled during the production settle step before browser assertions ran. The cancelled browser job was explicitly rerun; attempt 2 completed successfully, including production EN/RU browser QA, owner-copy/PDF verification, and RU Services form-control QA.

The generic web crawler available to ChatGPT returned an older cached Options page and therefore was not used to assert the new hero href. The deployed source on the exact live Render commit contains the requested `/trading-systems/options/viewer` destination, and the post-deploy production browser suite completed successfully against that runtime.

## Files changed by PR #194

```text
website_options_results_link_refinement.js
package.json
```

`app.js` is unchanged.

## Safety boundary

PR #194 does **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop rules, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram trade lifecycle publication logic;
- pricing amounts or billing calculations;
- viewer authentication/authorization semantics;
- Options journal data or brokerage evidence;
- public trading calculations or live-data source semantics.

The change is presentation/navigation-only and changes the destination of one existing Options hero CTA.

## Handbook

**Handbook update required: NO.**

The link change fits the already-documented website HTML refinement/preload architecture and introduces no new architecture, schema, environment variable, customer-access contract, or execution behavior.

## Rollback

To roll back only this Options hero-link change, revert PR #194 / merge commit:

```text
9812fb2cb27bc27dd324a2dd0af4a34e50f83e4f
```

This restores the previous hero destination without requiring any broker, trading, Pine, Sheets, Telegram lifecycle, pricing, viewer-data, or customer-data rollback.
