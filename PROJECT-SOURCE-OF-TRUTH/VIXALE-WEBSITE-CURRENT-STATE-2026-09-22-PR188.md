# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-22 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website runtime/QA state:

- **Verified runtime implementation commit:** `4a1b3380989661b529b7f23643986575dcde172a`
- **PR #188:** `Fix unified navigation on Swing Trading page` — MERGED
- **PR #188 merge SHA:** `4a1b3380989661b529b7f23643986575dcde172a`
- **PR #187:** `Unify public navigation and add Live Access` — MERGED
- **PR #187 merge SHA:** `a1c7949f1acc0d45b193ea1a8fd15368cc9352bd`
- **PR #186:** `Update Swing Trading page copy in EN and RU` — MERGED
- **PR #186 merge SHA:** `6a4ff3ab9dfff4158296d812e6f5519cf45c5826`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Verified runtime deploy:** `dep-daph9n6q1p3s73fcsqvg`
- **Verified runtime deploy commit:** `4a1b3380989661b529b7f23643986575dcde172a`
- **Verified runtime deploy status:** `live`
- **Production EN/RU Browser QA run:** `35799514616`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-22-PR183.md` as the website-facing runtime/QA baseline.

A documentation-only Source-of-Truth commit can be newer than the verified runtime implementation commit above without changing website behavior. For current operational claims, still re-check GitHub `main`, the active Render deploy, and the live website/production QA as required by `MASTER-INDEX.md`.

## Unified public navigation

The public website now uses one standard merged navigation treatment across the configured EN/RU public routes.

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

That destination is the existing viewer email-registration block. The existing `/password-request` flow and Cloudflare Turnstile behavior were not changed by PRs #187–#188.

The merged header uses the quieter text-link typography and spacing requested by the owner, with `Log In` as a text action and `Live Access` as the green rounded primary action. The active page remains exposed with `aria-current="page"`. Narrow layouts keep the merged links reachable via the responsive horizontal navigation behavior rather than silently removing links.

## Homepage action row

The homepage opening actions now read:

```text
Telegram Signals
Live Access
View Trading Results
```

Behavior:

- `Telegram Signals` keeps the existing Day Trading Telegram trial destination and approved 30-day Day Trading trial semantics.
- `Live Access` routes to `/#password-access`.
- `View Trading Results` continues to route to `/results`.
- The supporting line remains `30-day free trial of Day Trading Telegram signals.`

No Swing or Options Telegram-signal delivery was introduced by this copy/navigation change.

## Swing Trading copy retained

The owner-requested Swing Trading copy from PR #186 remains in the verified state.

EN hero:

```text
Active Portfolio
Active Portfolio based on Vixale's proprietary ranking system.
Positions are added and closed daily.
Updated every morning around 10:00 am. Refer to the trading guide.
```

The production owner-copy/PDF verification in run `35799514616` passed after the three-row Swing assertion was aligned with the approved copy.

## PR #187 production QA finding and PR #188 resolution

PR #187 successfully deployed, but its first production browser-QA run (`35798848879`) identified one real consistency defect: `/trading-systems/swing-trading` retained the older header in both EN and RU because that standalone page emitted a bare `<nav>` rather than the `.nav-links` / `.navlinks` wrapper used by the other public templates.

PR #188 fixed the root cause by adding a safe fallback in the final shared navigation refinement that:

- recognizes the standalone public `<nav>` shape;
- preserves the VIXALE brand anchor;
- inserts the same merged primary navigation and `Log In` / `Live Access` action group used on the other public pages.

A focused regression fixture was added for that standalone Swing header shape.

## Production verification details

GitHub Actions run `35799514616` was directly inspected against merge SHA `4a1b3380989661b529b7f23643986575dcde172a` after Render deploy `dep-daph9n6q1p3s73fcsqvg` reached `live`.

- `locale-contract`: **SUCCESS**
  - syntax checks: success
  - unified navigation and homepage CTA regressions: success
  - owner-requested public copy and PDF regressions: success
  - Services RU parity regression: success
  - existing Russian localization regressions: success
- `browser-qa`: **SUCCESS**
  - EN/RU production browser QA: success
  - owner copy and Trading Guide PDF live verification: success
  - RU Services form-control QA: success
  - browser QA artifact upload: success

The production locale artifact reported:

```text
Routes checked: 13
Viewports: desktop, mobile
Failures: 0
```

The artifact explicitly verified the unified public navigation labels, destinations, `Log In`, and `Live Access` on every configured public route at both desktop and mobile widths. Paired EN/RU production screenshots were generated for manual visual review.

## Safety boundary

PRs #186–#188 do **not** change:

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

PRs #187–#188 are website navigation/presentation changes. PR #186 is website copy/presentation only.

## Handbook

The shared-navigation contract is documented in:

`docs/VECO_DEVELOPER_HANDBOOK_UNIFIED_PUBLIC_NAV_LIVE_ACCESS_ADDENDUM.md`

The follow-up PR #188 did not require another handbook change because it corrected the implementation to match that already-recorded contract.

## Rollback

For the unified-navigation feature, revert PR #188 first if isolating the standalone Swing fix, or revert PR #187 and PR #188 together to return to the prior navigation presentation. No trading, broker, Sheets, Telegram lifecycle, pricing, or customer-access data rollback is required.
