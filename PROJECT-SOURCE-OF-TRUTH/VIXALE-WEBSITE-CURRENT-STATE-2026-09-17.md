# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #133 — `Issue #123 PR 5: implement pricing and manual subscription requests`
- **PR #133 merge SHA:** `342e941fb71a0e027b70bed8e96e1cd55cde3bca`
- **Observed PR state:** MERGED
- **Pre-merge verification:** branch 0 behind fresh `main`; exactly five intended pricing/offer/test/handbook/preload files; no configured GitHub Actions/status checks; focused regression source added
- **Render deploy:** `dep-damicm6gekts73ebpc1g`
- **Render deployed website-changing SHA:** `342e941fb71a0e027b70bed8e96e1cd55cde3bca`
- **Render deployment status:** LIVE
- **Render verification:** exact SHA built and started successfully
- **Fresh public-origin visual verification:** **UNVERIFIED** until direct origin/owner-visible verification; stale crawler output is not origin truth.

## Active Issue #123 product contract

- customer-facing systems: **Day Trading**, **Swing Trading**, **Options**;
- direct navigation: **Day Trading | Swing Trading | Options | Results | Pricing**;
- Day Trading Telegram signals trial: **30 days free**;
- Single System: **$49/month**;
- Three-System Bundle: **$99/month**;
- bundle = exactly Day + Swing + Options; comparison = `$48/month` less than three separate `$49` plans;
- Swing/Options Telegram delivery is not part of this release;
- bespoke setup/development/automation remain separate Services;
- no unsupported checkout, card, automatic billing, renewal, or trial-to-paid behavior may be invented.

## PR #133 — Pricing / subscription-request production contract

- `/pricing` now presents the approved 30-day / $49 / $99 / $147 / $48 values from `lib/website-commercial-offer.js`;
- the Day trial remains Day Trading Telegram signals only and uses the established Vixale Telegram DM destination;
- paid Single System and Bundle CTAs are **manual onboarding requests**, not fake checkout/payment actions;
- selected Single System requests identify Day Trading, Swing Trading, or Options explicitly;
- the Bundle request identifies exactly all three systems;
- free read-only viewer access is explicitly separate from the Day Telegram trial and paid subscriptions;
- no Swing/Options Telegram-delivery promise is added;
- no card form, auto-renew, automatic Day-31 billing, or automatic trial conversion is claimed.

## Prior Issue #123 production slices

- **PR #131 — Results:** merge `931442c4b3957789d3c11095bdfec6ae14cb7f3e`; Render `dep-damian97lnhs73cci9ng` LIVE. Data-first Day/Swing evidence, Options protected, no combined Vixale total.
- **PR #129 — System pages:** merge `9fdfff07160a3ec21b314d114c1d2c25b46b5295`; Render `dep-dami7hcs728c73c3ojmg` LIVE. Working-product-first Day/Swing/Options pages.
- **PR #126 — Homepage:** merge `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`; Render `dep-dami2j3ncjis73dk94kg` LIVE. Working Day/Swing/Options preview.
- **PR #124 — Navigation/trial:** merge `04991bfd7446fa18acc15e7a61581f372457576b`; Render `dep-damhrsjtqb8s73fujvcg` LIVE.

## Data ownership

- **Day Trading:** existing public status/open P&L, Closed Trades ledger/realized equity, protected Day viewer.
- **Swing Trading:** Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, Equity History.
- **Options:** owner-maintained Option Journal, existing derived closed-trade P&L/equity, protected owner-provided brokerage proofs.

Do not combine unlike sources, fabricate missing values, convert model results into brokerage-account performance, or change financial calculations as part of Issue #123.

## Safety boundary

Issue #123 through PR #133 does **not** change VECO strategy logic, signal timing, entries/exits/filters/stops/targets/risk, Pine, bridge/TWS/IBKR execution, Telegram trade lifecycle publication, Swing Trading Lab scoring/selection/writer behavior, Option Journal writes/P&L calculation, Google Sheet trading schemas/calculations, protected viewer auth, or `app.js`.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Locale/domain verification

Preferred canonical host remains `www.vixale.com`. Existing GET/HEAD apex-to-www handling remains. DNS/TLS edge routing and fresh public HTML still require direct verification.

## Historical reference

Detailed Issue #107 and Issue #123 contracts remain in Git history and handbook addenda. Use this manifest plus fresh GitHub/Render/live-origin verification for current claims.
