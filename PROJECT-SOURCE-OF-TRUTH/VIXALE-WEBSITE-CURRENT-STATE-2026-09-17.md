# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #126 — `Issue #123 PR 2: put working product preview in the homepage first screen`
- **PR #126 merge SHA:** `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** branch 0 behind fresh `main`; six intended homepage/offer/test/handbook/preload files only; no configured GitHub Actions/status checks; authenticated branch-source regression review completed; literal local checkout/tests unavailable because the sandbox could not resolve `github.com`
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-dami2j3ncjis73dk94kg`
- **Render deployed website-changing SHA:** `f510f60f2fe8aab8ec22ff5115c7c187deb8d3d6`
- **Render deployment status:** LIVE
- **Render startup verification:** build successful; exact PR #126 merge SHA checked out; `npm start` successfully parsed and launched `website_conversion_home_refinement.js` first, `website_conversion_navigation_refinement.js` second, then `website_public_qa_refinement.js`; server startup reached the normal runtime phase
- **Fresh public-origin visual verification for PR #126:** **UNVERIFIED**
  - GitHub + Render code/runtime state is directly verified;
  - the available external crawler has previously returned stale cached HTML and is not accepted as origin truth until a direct origin or owner-visible check is available.

## Active product direction — Issue #123

Issue #123 — `Engineering: implement approved Vixale conversion redesign` — is the active public-site implementation epic.

The owner-approved 2026-09-18 implementation brief supersedes earlier Issue #107 / audit presentation guidance where they conflict. In particular, working product data returns to the homepage opening and the public offer/navigation are conversion-oriented.

Approved customer-facing commercial/product contract:

- exactly three customer-facing systems: **Day Trading**, **Swing Trading**, **Options**;
- free trial: **30 days of Day Trading Telegram signals** only;
- **Single System:** `$49/month`, choose Day Trading, Swing Trading, or Options;
- **Three-System Bundle:** `$99/month`, includes exactly all three system subscriptions;
- bundle savings: `$48/month` compared with three separate `$49/month` subscriptions;
- bespoke setup, automation/integration, strategy review, bots, and custom development remain separate services;
- Telegram delivery in this release is Day Trading only; Swing and Options remain website-update products;
- no payment processor, card requirement, automatic billing, or day-31 conversion policy may be invented if not already supported by production behavior.

## PR #126 — Issue #123 PR 2 production contract

PR #126 replaces the prior explanation-first homepage opening with the approved working-product first screen.

Production contract:

- exact homepage H1: **Trading signals. Three systems. Your choice.**;
- exact supporting copy and CTA hierarchy from the approved brief;
- primary CTA **Get 30 Days Free** uses the verified Day Trading Telegram trial request;
- secondary CTA **View Trading Results** routes to `/results`;
- supporting line states **30-day free trial of Day Trading Telegram signals.**;
- desktop opening uses an approximately 40/60 copy/product-preview composition; mobile stacks copy and preview while keeping the product near the top;
- Day / Swing / Options are interactive preview tabs with button semantics, selected state, keyboard ArrowLeft/ArrowRight/Home/End behavior, stable panel height, and reduced-motion handling;
- **Day Trading — Live Overview** is selected by default;
- Day preview reuses existing real sources rather than creating a new calculation/polling pipeline:
  - Open Positions → `vx-home-live-0`
  - Open P&L → `vx-home-live-open-pnl`
  - Closed P&L Today → `vx-home-live-3`
  - Total Realized P&L → `vx-home-equity-total`
  - session/update state → `vx-home-day-badge` / `vx-home-day-updated`
  - compact realized-results chart → clone of existing `vx-home-equity-svg`;
- Swing preview lazily reads the existing public `/api/swing-leaders` endpoint once when first selected, shows already-published portfolio/model fields, and uses **Reviewed each trading morning / Latest published update** wording;
- the Swing sales preview does not repeat the older `Quotes delayed` phrase and does not rewrite Trading Lab values;
- Options has no invented public feed or sample values; its preview stays within existing public/protected access rules and routes to the public Options page / selected-system access journey;
- the three homepage system cards use the owner-approved Day / Swing / Options product copy and direct destinations;
- the previous long pre-data **How It Works** opening composition is removed from the first screen, while the existing lower Day data source remains present for safe mirroring;
- `lib/website-commercial-offer.js` is now the shared public-presentation source for the approved 30-day trial, `$49`, `$99`, `$48` savings, system labels/routes, and verified Telegram request URL/text;
- no payment/billing/subscription engine is created by those constants.

## PR #124 — Issue #123 PR 1 production contract

PR #124 established the direct navigation and trial-routing foundation:

- primary desktop navigation: **Day Trading | Swing Trading | Options | Results | Pricing**;
- right side: **Log In | Get 30 Days Free**;
- mobile keeps a visible three-system switcher;
- `/trading-systems` remains a supported legacy/search route but is no longer a required intermediate step;
- About / Services / Help are secondary/footer navigation;
- active direct page/system links expose `aria-current="page"`;
- **Get 30 Days Free** reuses `t.me/tradervip22` with `Hello, I'd like to start the 30-day free Day Trading Telegram signals trial.`;
- the CTA does not imply Swing/Options Telegram delivery or invented checkout/billing behavior.

PR #124 merge SHA: `04991bfd7446fa18acc15e7a61581f372457576b`  
Verified Render deploy: `dep-damhrsjtqb8s73fujvcg` — LIVE.

## Prior verified website baseline

Immediately before Issue #123, the latest website-changing baseline was PR #121 — `Issue #107 PR 7: accessibility, SEO, host, and end-to-end public QA` — merge SHA `703919449615b582e76bca4bff0ed3046136c998`, deployed LIVE as `dep-damgj28ae00c73bllmfg`.

Issue #107's data/auth foundations remain the base that Issue #123 is recomposing rather than replacing:

- `/results` remains system-aware;
- `/access` remains the secured viewer-request journey;
- Swing remains a public research/model portfolio, not brokerage-account performance;
- Options protected records/proofs remain behind viewer auth;
- Day Trading public/status and Closed Trades sources remain unchanged;
- Services retain the existing bespoke service forms unless a later Issue #123 PR changes customer-facing presentation only.

## Data ownership

Issue #123 is a website redesign/conversion project. Existing source and calculation ownership remains unchanged unless a later PR explicitly documents presentation-only reuse:

- **Day Trading:** existing public live/status data, open P&L where supported, realized Closed Trades ledger/equity series, and protected dashboard viewer;
- **Swing Trading:** existing Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, and Equity History;
- **Options:** existing owner-maintained Option Journal, closed-position/result calculation, and protected owner-provided brokerage proofs.

Do not combine unlike sources into one unexplained P&L, convert model returns into brokerage returns, fabricate missing data, or change financial calculations as part of the redesign.

## Safety boundary

PR #124 and PR #126 do **not** change:

- VECO strategy logic;
- signal generation;
- entry/exit conditions;
- targets/stops/risk logic;
- Pine;
- bridge / TWS / IBKR execution;
- Telegram trade lifecycle publication;
- Swing Trading Lab scoring / selection / writer behavior;
- Option Journal owner write workflow or result calculations;
- Google Sheet trading schemas;
- protected dashboard/viewer authentication or authorization;
- `app.js`.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation.

## Locale/domain verification

The preferred canonical host remains `www.vixale.com`. Existing application-level GET/HEAD apex-to-www behavior from PR #121 remains in place. DNS/TLS edge routing and fresh user-visible public HTML remain subject to direct verification rather than crawler inference.

Render reports `ru.vixale.com` among service domains, but repository inspection has not identified a separate Russian public navigation implementation. Issue #123 has not introduced a separate RU fork.

## Historical reference

Prior manifests and detailed Issue #107 per-PR contracts remain in Git history / `PROJECT-SOURCE-OF-TRUTH/`. For current website-changing production state, use this manifest plus fresh GitHub/Render/live-origin verification according to `MASTER-INDEX.md`.
