# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #139 — `Fix empty public charts by preserving inline scripts`
- **PR #139 merge SHA:** `e0f31089d59d571776c8de10e016dedd796b15de`
- **Observed PR state:** MERGED
- **Focused pre-merge verification:** GitHub Actions run `35373809447` — SUCCESS; source syntax, emitted-script parse regression, existing homepage runtime-script regression, PR7 final-QA regression, and `git diff --check` all passed.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damn7errjlhs7390fld0`
- **Render deployed website-changing SHA:** `e0f31089d59d571776c8de10e016dedd796b15de`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #139 merge SHA checked out and Render reported the deployment LIVE.
- **Fresh public-origin verification:** GitHub Actions run `35374267933` — SUCCESS against `https://www.vixale.com` after the Render deploy.
- **Live performance endpoint:** `/public-performance.json` returned `ok: true` with 61 realized-equity points during verification.
- **Live inline scripts:** all 10 homepage inline scripts and both Results inline scripts passed `node --check` against fetched production HTML.
- **Live browser verification:** headless Google Chrome executed the public homepage and Results page successfully; the homepage contained both `vx-conversion-day-equity-svg` and `vx-home-equity-svg`, the Results chart contained a rendered `<polyline>`, loading states were gone, and the verification found no SyntaxError / ReferenceError / TypeError / CSP execution errors.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #139 as the latest website-changing code reference.

## PR #139 — empty-chart root cause and production fix

The empty public charts reported after PR #137 were traced to browser-side JavaScript corruption, not to Google Sheets, the realized-P&L calculation, or the public performance endpoint.

Root causes:

1. Homepage/Results chart scripts containing currency literals such as `'+$'` and `'-$'` were injected with `String.replace(..., replacementString)`. JavaScript treats `$'` as a special replacement token, so the emitted production script was corrupted before reaching the browser.
2. The Results client script independently contained one extra closing brace at the end of its Swing update block.

Production fix:

- `website_conversion_home_refinement.js` now inserts its inline script through a callback replacer, preserving the script bytes literally.
- `website_conversion_final_qa_refinement.js` uses the same callback-replacer pattern for the final homepage chart script.
- `website_conversion_results_refinement.js` uses a callback replacer and removes the single extra brace.
- `tests/test_chart_inline_script_injection.js` verifies that all three emitted chart scripts remain parseable after HTML injection.

The fix changes presentation/runtime script emission only. It does not change the performance endpoint, P&L formulas, Google Sheet reads/writes, portfolio calculations, authentication, or trading behavior.

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

## PR #137 — final conversion product/presentation contract

### Homepage first screen

- `Trading signals. Three systems. Your choice.` uses the same responsive `30–42px` range as `Day Trading System Status` rather than the earlier oversized 48–62px treatment.
- The first-screen Day Trading chart and lower Day Trading equity chart use the existing `/public-performance.json` `equity_curve.points` / `cumulative_pnl` values.
- No new P&L calculation or alternate performance source is introduced.
- The lower chart label is normalized to `Realized P&L Equity Curve` if an older presentation layer emits `Open P&L Equity Curve`.
- Missing/unavailable points are not replaced by simulated values.

PR #139 is the runtime correction that makes those approved chart paths execute correctly in the browser; live headless-browser verification now confirms both homepage SVG charts render.

### Trading Guide / Options public presentation

- The maintained five-page guide source is `Vixale_Trading_Guide.pdf.b64`; `/download/trading-guide.pdf` serves that committed source directly.
- Public HTML/PDF no longer expose the legacy Options Straddles execution material: the 6:00–8:30 PM window, call+put opening recipe, +10% debit target, SPY sample trade, and hedge/exit instruction sequence are removed.
- Options is presented as a protected website / Option Journal position-update workflow with protected closed evidence and available owner-provided brokerage proof.
- No public sample Options trade/P&L is fabricated.
- Swing/Options Telegram signal delivery is not promised.
- Guide commerce framing remains: 30-day Day Trading trial, `$49/month` Single System, `$99/month` Three-System Bundle, free viewer access, and separate Services.

### Pricing SEO / sitemap / responsive QA

- `/pricing` is included exactly once in the canonical sitemap.
- `/pricing` metadata identifies the `$49` Single System, `$99` Three-System Bundle, and 30-day Day Trading Telegram trial.
- Existing skip-link, keyboard focus, reduced-motion, canonical-host, and public accessibility layers remain in place.
- Guide CTA/grid rules include narrow-screen stacking/full-width behavior.

## Prior Issue #123 production slices

- **PR #137 — final Guide / charts / SEO QA:** merge `d9acc5452bf538753d3ca7e82954528906e4e5c9`; Render `dep-daminrcs728c73c49em0` was LIVE before later deploys superseded it. PR #139 subsequently fixed the chart script-emission defect found in owner-visible production.
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

Issue #123 and the PR #139 chart follow-up do **not** change VECO strategy/Pine, signal timing, entries/exits/filters/stops/targets/risk, bridge/TWS/IBKR execution, Telegram trade lifecycle publication, Swing Trading Lab scoring/selection/writer behavior, Option Journal writes/P&L calculation, Google Sheet trading schemas/calculations, or protected viewer authentication behavior.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Closure state

Issue #123 remains completed. PR #139 is a focused production defect fix discovered by the owner after that conversion work. The exact PR #139 merge SHA is LIVE and the chart fix has been independently exercised against the public `www.vixale.com` origin with a real headless Chrome browser.
