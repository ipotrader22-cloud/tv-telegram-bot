# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #135 — `Issue #123 PR 6: clarify Telegram trial access and custom services`
- **PR #135 merge SHA:** `b532741a5162e7a580fc97a9b9519f1d003f3bd7`
- **Observed PR state:** MERGED
- **Pre-merge verification:** branch 0 behind fresh `main`; exactly four intended presentation/test/handbook/preload files; no configured GitHub Actions/status checks; focused source regression added
- **Render deploy:** `dep-damiejh7lnhs73ccm940`
- **Render deployed website-changing SHA:** `b532741a5162e7a580fc97a9b9519f1d003f3bd7`
- **Render deployment status:** LIVE
- **Render verification:** exact SHA checked out; build successful; `npm start` begins with `website_conversion_access_services_refinement.js`; server bound port 10000; Render reported the service live
- **Fresh public-origin visual verification:** **UNVERIFIED** until a direct origin/owner-visible check is available; stale crawler output is not treated as origin truth.

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

## PR #135 — Telegram / Access / Services production contract

### Day Trading Telegram example
- the public Day page includes an illustrative placeholder example matching the existing Prime-open formatter field structure: strategy/side, ticker, Entry, Target, Stop Ref;
- placeholder values such as `[TICKER]`, `[entry]`, `[target]`, and `[stop]` are used;
- the example is explicitly not a live trade, recommendation, ticker, price, target, stop, or result;
- production Telegram publication code is unchanged;
- the 30-day trial remains Day Trading Telegram signals only.

### Viewer access
- `/access` retains the existing secured request form and backend behavior;
- public copy now separates free read-only viewer access from the Day Trading Telegram trial and from paid `$49` / `$99` subscriptions;
- email verification/manual review and existing auth/session behavior remain unchanged.

### Services
- `/services` retains the four existing bespoke paths/forms: Signals & Research; Automation / Setup; Strategy Review / Development; Custom Bot / Integration;
- custom Services are explicitly separate from standard trading-system subscriptions and free viewer access;
- existing form actions/request schemas remain unchanged.

## Prior Issue #123 production slices

- **PR #133 — Pricing:** merge `342e941fb71a0e027b70bed8e96e1cd55cde3bca`; Render `dep-damicm6gekts73ebpc1g` LIVE. Approved 30-day / $49 / $99 offer with manual onboarding requests only.
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

Issue #123 through PR #135 does **not** change VECO strategy logic, signal timing, entries/exits/filters/stops/targets/risk, Pine, bridge/TWS/IBKR execution, Telegram trade lifecycle publication, Swing Trading Lab scoring/selection/writer behavior, Option Journal writes/P&L calculation, Google Sheet trading schemas/calculations, protected viewer auth, or `app.js`.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Locale/domain verification

Preferred canonical host remains `www.vixale.com`. Existing GET/HEAD apex-to-www handling remains. DNS/TLS edge routing and fresh public HTML still require direct verification.

## Historical reference

Detailed Issue #107 and Issue #123 contracts remain in Git history and handbook addenda. Use this manifest plus fresh GitHub/Render/live-origin verification for current claims.
