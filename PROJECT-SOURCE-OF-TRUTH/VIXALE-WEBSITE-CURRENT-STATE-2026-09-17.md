# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #131 — `Issue #123 PR 4: make Results data-first by system`
- **PR #131 merge SHA:** `931442c4b3957789d3c11095bdfec6ae14cb7f3e`
- **Observed PR state:** MERGED
- **Pre-merge verification:** Node syntax PASS; focused Results regression PASS; branch 0 behind fresh `main`; exactly four intended files; no configured GitHub Actions/status checks
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damian97lnhs73cci9ng`
- **Render deployed website-changing SHA:** `931442c4b3957789d3c11095bdfec6ae14cb7f3e`
- **Render deployment status:** LIVE
- **Render verification:** exact SHA checked out; build successful; `npm start` begins with `website_conversion_results_refinement.js`; service reached LIVE
- **Fresh public-origin visual verification:** **UNVERIFIED** until a direct origin/owner-visible check is available; previously stale crawler output is not treated as origin truth.

## Active product direction — Issue #123

The owner-approved conversion redesign remains active. Public commercial contract:

- systems: **Day Trading**, **Swing Trading**, **Options**;
- navigation: **Day Trading | Swing Trading | Options | Results | Pricing**;
- free trial: **30 days of Day Trading Telegram signals only**;
- **Single System:** `$49/month`;
- **Three-System Bundle:** `$99/month`;
- bundle includes exactly all three systems and saves `$48/month` versus three separate `$49` subscriptions;
- Swing/Options Telegram delivery is not part of this release;
- bespoke setup/development/automation remain separate Services;
- no unverified checkout, card requirement, automatic billing, renewal, or trial-to-paid conversion behavior may be invented.

## PR #131 — Results production contract

`/results` is now data-first while keeping each evidence owner separate.

### Day Trading
- reuses `/public-performance.json` and `/public-live-open-pnl.json`;
- shows Open Positions, Open P&L, Closed P&L Today, Total Realized P&L, and existing realized-equity points;
- Open P&L remains separate from realized P&L;
- no new polling loop or calculation owner is introduced.

### Swing Trading
- reuses `/api/swing-leaders`;
- shows already-published Active Portfolio count, Potential Candidates count, latest Total Model P&L, and a small active-position preview;
- remains explicitly a research/model portfolio, not brokerage-account performance.

### Options
- no public sample P&L or fictitious trade values are substituted;
- owner-entered journal rows, closed-only realized equity, and available owner-provided brokerage screenshots remain protected behind existing viewer access.

### Separation rule
- there is **no combined Vixale performance total**;
- Day Trading, Swing Trading, and Options evidence are not added together or normalized into one account result.

## Prior Issue #123 production slices

- **PR #129 — System pages:** merge `9fdfff07160a3ec21b314d114c1d2c25b46b5295`; Render `dep-dami7hcs728c73c3ojmg` LIVE. Day uses existing public Day endpoints; Swing preserves the public Swing Leaders portfolio; Options preserves protected journal boundaries.
- **PR #126 — Homepage:** merge `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`; Render `dep-dami2j3ncjis73dk94kg` LIVE. Working Day/Swing/Options product preview and shared commercial constants.
- **PR #124 — Navigation/trial:** merge `04991bfd7446fa18acc15e7a61581f372457576b`; Render `dep-damhrsjtqb8s73fujvcg` LIVE. Direct system navigation and verified Day Trading Telegram trial request.

## Data ownership

- **Day Trading:** existing public status/open P&L, Closed Trades ledger/realized equity, protected Day viewer.
- **Swing Trading:** Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, Equity History.
- **Options:** owner-maintained Option Journal, existing derived closed-trade P&L/equity, protected owner-provided brokerage proofs.

Do not combine unlike sources, fabricate missing data, convert model results into brokerage-account performance, or change financial calculations as part of Issue #123.

## Safety boundary

Issue #123 PRs #124, #126, #129 and #131 do **not** change:

- VECO strategy logic or signal timing;
- entries/exits/filters/stops/targets/risk;
- Pine;
- bridge / TWS / IBKR execution;
- Telegram trade lifecycle publication;
- Swing Trading Lab scoring / selection / writer behavior;
- Option Journal owner writes or P&L calculation;
- Google Sheet trading schemas/calculations;
- protected dashboard/viewer authentication or authorization;
- `app.js`.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Locale/domain verification

Preferred canonical public host remains `www.vixale.com`. Application-level GET/HEAD apex-to-www behavior from PR #121 remains in place. DNS/TLS edge routing and fresh user-visible public HTML still require direct verification rather than crawler inference.

## Historical reference

Detailed Issue #107 and prior Issue #123 contracts remain in Git history and handbook addenda. Use this manifest plus fresh GitHub/Render/live-origin verification for current claims.
