# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-23 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website runtime/QA state:

- **Verified runtime implementation commit:** `193ff3e0d2f43d6fba0820b91549a99bfeb47532`
- **PR #192:** `Add Live Access CTA to Day Trading hero` — MERGED
- **PR #192 merge SHA:** `193ff3e0d2f43d6fba0820b91549a99bfeb47532`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified runtime deploy:** `dep-daprcu5g1s2s73fd3p60`
- **Verified runtime deploy commit:** `193ff3e0d2f43d6fba0820b91549a99bfeb47532`
- **Verified runtime deploy status:** `live`
- **Production EN/RU Browser QA run:** `35854159870` (run #54)
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-22-PR190.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For current operational claims, still re-check GitHub `main`, the active Render deploy, and the live website/production QA as required by `MASTER-INDEX.md`.

## Day Trading Live Access CTA

PR #192 adds a secondary **Live Access** CTA to the hero action row on:

```text
/trading-systems/day-trading
```

Verified English CTA order:

```text
Get 30 Days Free
Live Access
View Day Trading Results
```

The `Live Access` destination is:

```text
/#password-access
```

The button uses the existing outlined secondary pill treatment already used by the Day Trading hero action row. Existing trial and results destinations remain unchanged.

The Russian localization layer translates the same CTA to **Live-доступ** while preserving the same destination and layout.

## Production verification details

Verification performed after PR #192 merge:

```text
GitHub main commit:
193ff3e0d2f43d6fba0820b91549a99bfeb47532

Render deploy:
dep-daprcu5g1s2s73fd3p60
status: live
commit: 193ff3e0d2f43d6fba0820b91549a99bfeb47532

GitHub Actions:
Production EN/RU Browser QA
run id: 35854159870
run number: 54
status: completed
conclusion: success
head: main
head SHA: 193ff3e0d2f43d6fba0820b91549a99bfeb47532
```

The post-merge browser QA artifact contains fresh desktop/mobile screenshots for EN and RU. Direct inspection of the desktop Day Trading screenshots verified that the new Live Access / Live-доступ button is visibly present between the trial and results buttons.

The generic web-fetch source available to ChatGPT returned an older cached copy of the page, so it was not used as the final visual verification source. The fresh post-merge Playwright production artifact is the direct browser verification for this change.

## Files changed by PR #192

```text
website_day_trading_live_access_refinement.js
package.json
```

`app.js` is unchanged.

## Safety boundary

PR #192 does **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop rules, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram trade lifecycle publication logic;
- pricing amounts or billing calculations;
- viewer authentication/authorization semantics;
- Cloudflare Turnstile configuration or verification mechanics;
- public trading calculations or live-data source semantics.

The change is presentation-only and limited to the Day Trading CTA row plus its preload registration.

## Handbook

**Handbook update required: NO.**

The CTA addition fits the already-documented website HTML refinement/preload architecture and introduces no new architecture, schema, environment variable, customer-access contract, or execution behavior.

## Rollback

To roll back only the Day Trading Live Access CTA, revert PR #192 / merge commit:

```text
193ff3e0d2f43d6fba0820b91549a99bfeb47532
```

This removes the Day-only refinement and its preload entry without requiring any broker, trading, Pine, Sheets, Telegram lifecycle, pricing, viewer-code, or customer-data rollback.
