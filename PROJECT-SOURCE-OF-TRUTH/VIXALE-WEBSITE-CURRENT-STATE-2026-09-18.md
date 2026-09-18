# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #137 — `Issue #123 PR 7: final guide, charts, SEO and responsive QA`
- **PR #137 merge SHA:** `d9acc5452bf538753d3ca7e82954528906e4e5c9`
- **Observed PR state:** MERGED
- **PR verification:** temporary GitHub Actions run `35343783026` — SUCCESS on code head `021dbfb0c1d9b3245551334f56c449866dbd944d`; syntax and focused PR7 regression passed. Final feature head differed only by deletion of that temporary workflow file.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-daminrcs728c73c49em0`
- **Render deployed website-changing SHA:** `d9acc5452bf538753d3ca7e82954528906e4e5c9`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #137 merge SHA checked out; build successful; `npm start` begins with `website_conversion_final_qa_refinement.js`; server bound port 10000; Render reported `Your service is live`.
- **Fresh post-deploy visual verification:** **UNVERIFIED from the current tool environment.** Direct Render-origin HTTP fetch was unavailable from the crawler/container environment, so deployment/source verification is not upgraded to an independent browser visual claim. Owner-visible browser refresh remains the authoritative visual check.

## Issue #123 final customer-facing product contract

- exactly three systems: **Day Trading**, **Swing Trading**, **Options**;
- direct navigation: **Day Trading | Swing Trading | Options | Results | Pricing**;
- right-side actions: **Log In** + **Get 30 Days Free**;
- free trial: **30 days of Day Trading Telegram signals only**;
- Single System: **$49/month**;
- Three-System Bundle: **$99/month**;
- bundle includes exactly Day Trading, Swing Trading, and Options;
- viewer access is free/read-only and separate from both the Telegram trial and paid subscriptions;
- bespoke setup/development/automation remain separate Services;
- Swing/Options Telegram delivery is not promised in this release;
- no unsupported checkout, automatic billing/renewal, fabricated trade data, or new trading logic is introduced.

## PR #137 — final production contract

### Homepage first screen

- `Trading signals. Three systems. Your choice.` remains the approved H1, but its responsive type range is now the same `30–42px` range used by `Day Trading System Status` instead of the prior oversized 48–62px treatment.
- The first-screen Day Trading chart and the lower Day Trading equity chart render from the existing `/public-performance.json` `equity_curve.points` / `cumulative_pnl` values.
- PR #137 introduces **no new P&L calculation and no alternate performance source**; it only renders the already-authorized realized-equity points into SVG.
- The lower chart label is normalized to `Realized P&L Equity Curve` if an older presentation layer emits the conflicting `Open P&L Equity Curve` label.
- Missing/unavailable points are not replaced by simulated values.

The two homepage issues reported immediately before PR #137 — empty charts and an oversized hero heading — are therefore addressed in the deployed PR #137 source contract. Post-deploy browser appearance still requires owner-visible confirmation because a fresh origin browser could not be driven from the current tool environment.

### Trading Guide / Options public presentation

- The maintained five-page guide source is `Vixale_Trading_Guide.pdf.b64`; the public `/download/trading-guide.pdf` route now serves that committed source directly.
- The final public HTML guide removes the legacy Options Straddles execution material: the 6:00–8:30 PM window, call+put opening recipe, +10% debit target, SPY sample trade, and hedge/exit instruction sequence.
- Options is presented as a protected website / Option Journal position-update workflow with protected closed evidence and available owner-provided brokerage proof.
- No public sample Options trade/P&L is fabricated.
- Swing/Options Telegram signal delivery is not promised.
- Guide commerce framing matches the approved contract: 30-day Day Trading trial, `$49/month` Single System, `$99/month` Three-System Bundle, free viewer access, and separate Services.

### Pricing SEO / sitemap / responsive QA

- `/pricing` is included exactly once in the final canonical sitemap.
- `/pricing` metadata identifies the `$49` Single System, `$99` Three-System Bundle, and 30-day Day Trading Telegram trial.
- Existing skip-link, keyboard focus, reduced-motion, canonical-host, and public accessibility layers remain in place.
- Final guide CTA/grid rules include narrow-screen stacking/full-width behavior.

## Prior Issue #123 production slices

- **PR #135 — Telegram / Access / Services:** merge `b532741a5162e7a580fc97a9b9519f1d003f3bd7`; Render `dep-damiejh7lnhs73ccm940` was LIVE before later deploys superseded it.
- **PR #133 — Pricing:** merge `342e941fb71a0e027b70bed8e96e1cd55cde3bca`; Render `dep-damicm6gekts73ebpc1g` was LIVE before later deploys superseded it.
- **PR #131 — Results:** merge `931442c4b3957789d3c11095bdfec6ae14cb7f3e`; Render `dep-damian97lnhs73cci9ng` was LIVE before later deploys superseded it.
- **PR #129 — System pages:** merge `9fdfff07160a3ec21b314d114c1d2c25b46b5295`; Render `dep-dami7hcs728c73c3ojmg` was LIVE before later deploys superseded it.
- **PR #126 — Homepage:** merge `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`; Render `dep-dami2j3ncjis73dk94kg` was LIVE before later deploys superseded it.
- **PR #124 — Navigation / Day trial:** merge `04991bfd7446fa18acc15e7a61581f372457576b`; Render `dep-damhrsjtqb8s73fujvcg` was LIVE before later deploys superseded it.

## Data ownership

- **Day Trading:** existing public status/open P&L, Closed Trades ledger/realized equity, protected Day viewer.
- **Swing Trading:** Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, Equity History.
- **Options:** owner-maintained Option Journal, existing derived closed-trade P&L/equity, protected owner-provided brokerage proofs.

Do not combine unlike sources, fabricate missing values, convert model results into brokerage-account performance, or change financial calculations as part of the website conversion layer.

## Safety boundary

Issue #123 through PR #137 does **not** change VECO strategy/Pine, signal timing, entries/exits/filters/stops/targets/risk, bridge/TWS/IBKR execution, Telegram trade lifecycle publication, Swing Trading Lab scoring/selection/writer behavior, Option Journal writes/P&L calculation, Google Sheet trading schemas/calculations, or protected viewer authentication behavior.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Closure state

All seven Issue #123 implementation slices have been merged. The exact PR #137 website-changing merge SHA has reached Render LIVE and this Current-State record captures that production state. Issue #123 is eligible to close; any subsequent visual-only follow-up discovered by an owner browser refresh should be opened as a new focused issue rather than reopening the completed conversion scope unless it proves the deployed PR #137 contract did not take effect.
