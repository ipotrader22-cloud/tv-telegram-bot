# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-20 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #167 — `Complete Russian localization for current public pages`
- **PR #167 merge SHA:** `1d82640130e9ce589748fa928ffc37ad35985ac6`
- **Observed PR #167 state:** MERGED
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** commit-triggered
- **Render deploy for PR #167:** `dep-dao71hss728c73bdqqvg`
- **Render deployed website-changing SHA:** `1d82640130e9ce589748fa928ffc37ad35985ac6`
- **Render deployment status:** LIVE
- **Render verification:** the deployment record for `dep-dao71hss728c73bdqqvg` identifies the exact PR #167 merge SHA and reached `live` after the new-commit deploy.
- **Fresh independent post-PR167 browser verification:** **UNVERIFIED** in the current assistant web-fetch environment. The owner reported pre-fix RU translation/parity failures and subsequently authorized the corrective merges, but no independent post-PR167 browser screenshot run is recorded here yet. Do not infer pixel-perfect EN/RU parity from Render deployment state alone.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-20-PR160.md` once the documentation PR that points `MASTER-INDEX.md` here is merged.

## Website-changing states since PR #160

### PR #162 — Homepage Day preview direct-feed correction

- Merge SHA: `2cf92c9896494273f724508e4b27cd3a5d9e2ffe`
- Render deploy: `dep-danmqu97lnhs73eb2ba0`
- Result: homepage Day preview was corrected to mirror the authoritative public performance feed rather than relying on renderer-derived delayed presentation state.
- Trading logic and execution behavior were unchanged.

### PR #164 — Russian-site localization layer

- Merge SHA: `69d73351fdc0ea4ad843157fd15e5b2e3b714e94`
- Render deploy: `dep-dao59ics728c73bcfda0`
- Result: introduced host-scoped Russian localization for `ru.vixale.com` while reusing the public website presentation stack.
- Production QA subsequently exposed translation-integrity and visual-parity defects corrected by PR #165 and PR #166.

### PR #165 — Russian translation integrity and asset parity

- Merge SHA: `0cc95eaf50e52553920cebf4182c8935f0a4b9a3`
- Render deploy: `dep-dao5i5cs728c73bcmi6g`
- Result: replaced unsafe substring translation with exact-node translation and stopped broad host rewrites of CSS/image/script asset URLs.
- English-host output remained outside the RU localization transform.

### PR #166 — Canonical homepage renderer for RU

- Merge SHA: `30df6dc5108dda1f2619006774bde8382dacc109`
- Render deploy: `dep-dao6qd4s728c73bdl9q0`
- Result: corrected the legacy RU homepage-renderer split so the Russian root page starts from the same canonical homepage renderer/refinement stack as the English site before localization.
- No trading, broker, data-source, or calculation logic changed.

### PR #167 — Current public-page Russian localization

- Merge SHA: `1d82640130e9ce589748fa928ffc37ad35985ac6`
- Render deploy: `dep-dao71hss728c73bdqqvg`
- Result: added complete-node Russian translations for the current Day Trading, Options, Results, and Pricing conversion/refinement copy, plus a RU-only exact-text runtime localization pass for approved client-side text inserted after page load.
- Numeric values, dates, prices, P&L, tickers, routes, API payloads, form values, CSS, assets, and page scripts remain unchanged by the localization transform.

## Russian-site architecture contract

The public Russian site is not a separate design implementation.

```text
www.vixale.com
-> canonical public renderer/refinement stack
-> English response

ru.vixale.com
-> same canonical public renderer/refinement stack
-> host-scoped Russian presentation localization
-> Russian response
```

The localization layer may change approved user-facing text and locale/SEO metadata only. It must not create a second page composition, alternate trading data, synthetic performance, translated API payloads, or separate CSS/data sources.

Exact-node translation is mandatory for normal prose. Unknown new English text remains intact for QA rather than being partially translated into mixed Russian/English copy. Approved dynamic browser text may use only narrowly anchored templates that preserve live date/number/P&L payloads.

## Visual/browser verification status

Render deployment proves which source commit is serving the service; it does not prove browser-visible parity. Until an independent browser run is captured, the following remain explicitly **UNVERIFIED** post-PR167:

- pixel-level desktop parity between `www.vixale.com` and `ru.vixale.com`;
- pixel-level mobile parity;
- absence of every residual English visible string on all RU public routes;
- client-side mutation behavior after live-data refresh on every affected page.

A dedicated EN/RU production browser-QA workflow should be used to close this verification gap and store screenshots/artifacts independently of the assistant web-fetch path.

## Data and safety boundary

PRs #162, #164, #165, #166, and #167 do **not** change:

- VECO strategy rules, signal generation, entries, exits, targets, stops, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution logic;
- local bridge execution behavior;
- Google Sheets trading schemas or calculations;
- Telegram lifecycle;
- `/public-performance.json` calculations;
- Swing Trading Lab scoring, selection, portfolio membership, or model-P&L calculations;
- Option Journal owner-write workflow;
- dashboard/authentication security contracts.

These are website presentation, localization, and homepage-display corrections only.

## Prior website-changing state

The prior checked-in Current-State manifest is:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-20-PR160.md`

Its contracts remain in force except where PR #162 and PRs #164–#167 explicitly supersede homepage Day preview presentation and Russian-site rendering/localization behavior.

## Source-of-Truth maintenance note

The checked-in `MASTER-INDEX.md` must point to this PR167 manifest after the documentation synchronization PR merges. Future website-facing production changes must advance the pointer again rather than leaving this file to become a stale operational baseline.
