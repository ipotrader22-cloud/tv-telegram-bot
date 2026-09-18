# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #124 — `Issue #123 PR 1: direct system navigation and Day trial CTA`
- **PR #124 merge SHA:** `04991bfd7446fa18acc15e7a61581f372457576b`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** new conversion-navigation refinement Node syntax PASS; focused Issue #123 PR 1 direct-navigation regression PASS; branch 0 behind fresh `main`; no configured GitHub Actions/status checks; complete diff limited to four intended navigation/test/handbook/preload files
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damhrsjtqb8s73fujvcg`
- **Render deployed website-changing SHA:** `04991bfd7446fa18acc15e7a61581f372457576b`
- **Render deployment status:** LIVE
- **Render startup verification:** build successful; Render deployed the exact PR #124 merge SHA; `npm start` launched `website_conversion_navigation_refinement.js` first, followed by `website_public_qa_refinement.js`; server reported port 10000; Render reported the service live
- **Fresh public-origin verification for PR #124:** **UNVERIFIED**
  - GitHub + Render code/runtime state is directly verified;
  - the available external crawler has previously returned stale cached public HTML and is not accepted as origin truth until a fresh direct-origin or owner check is available.

## Active product direction — Issue #123

Issue #123 — `Engineering: implement approved Vixale conversion redesign` — is the active public-site implementation epic.

The owner-approved 2026-09-18 implementation brief supersedes earlier Issue #107 / audit presentation guidance where the two conflict. In particular, the new direction restores working product data to the opening homepage experience and changes the public navigation/commercial offer.

Approved customer-facing commercial/product contract:

- exactly three customer-facing trading-system subscriptions: **Day Trading**, **Swing Trading**, **Options**;
- free trial: **30 days of Day Trading Telegram signals** only;
- **Single System:** `$49/month`, customer chooses Day Trading, Swing Trading, or Options;
- **Three-System Bundle:** `$99/month`, includes exactly all three system subscriptions;
- bundle comparison: `$48/month` less than three separate `$49/month` subscriptions;
- bespoke setup, automation/integration, strategy review, bots, and custom development remain separate services;
- Telegram signal delivery in this release is Day Trading only; Swing and Options remain website-update products;
- no payment processor, card requirement, automatic billing, or day-31 conversion policy may be invented if not already supported by production behavior.

## PR #124 — Issue #123 PR 1 production contract

PR #124 establishes the direct navigation and trial-routing foundation for the conversion redesign.

Production contract:

- shared public desktop navigation is now **Day Trading | Swing Trading | Options | Results | Pricing**;
- right-side public actions are **Log In** and primary **Get 30 Days Free**;
- direct routes are:
  - Day Trading → `/trading-systems/day-trading`
  - Swing Trading → `/trading-systems/swing-trading`
  - Options → `/trading-systems/options`
  - Results → `/results`
  - Pricing → `/pricing`
  - Log In → `/dashboard`;
- `/trading-systems` remains a supported public legacy/search route but is no longer required as an intermediate system-switching step;
- About, Services, and Help are secondary/footer navigation;
- the active Day/Swing/Options/Results/Pricing link exposes `aria-current="page"` and receives a selected visual treatment;
- at narrow widths, Day Trading / Swing Trading / Options remain visible as a dedicated three-item system switcher; Results/Pricing may collapse from the compact row;
- **Get 30 Days Free** reuses the already-established Telegram DM destination at `t.me/tradervip22` with the explicit request text `Hello, I'd like to start the 30-day free Day Trading Telegram signals trial.`;
- the new trial request removes the older futures-waitlist wording and does not imply Swing/Options Telegram delivery;
- the trial CTA does not claim activation occurs at click/message send and does not invent checkout, card, billing, or renewal behavior;
- protected routes are not rewritten by the new navigation layer.

Implementation ownership:

- `website_conversion_navigation_refinement.js` owns the Issue #123 direct public navigation/secondary navigation/trial CTA presentation;
- it is intentionally first in the current preload order so it receives the final outbound HTML after older navigation refinements unwind;
- `website_public_qa_refinement.js` remains immediately after it and continues to own public SEO/accessibility/canonical-host guardrails;
- broad preload/HTML-rewrite consolidation remains separately owned by open Issue #89.

## Prior verified website baseline

Immediately before Issue #123, the latest verified website-changing baseline was PR #121 — `Issue #107 PR 7: accessibility, SEO, host, and end-to-end public QA` — merge SHA `703919449615b582e76bca4bff0ed3046136c998`, deployed LIVE on Render as `dep-damgj28ae00c73bllmfg`.

Issue #107 completed the prior public UX/navigation epic. Its working data/auth boundaries remain the base that Issue #123 is recomposing rather than replacing:

- `/results` remains system-aware;
- `/access` remains the secured viewer-request journey;
- Swing remains a public research/model portfolio, not brokerage-account performance;
- Options protected records/proofs remain behind viewer auth;
- Day Trading public/status and Closed Trades sources remain unchanged;
- Services retain the four existing bespoke service paths unless a later Issue #123 PR changes customer-facing wording only.

The Git history before PR #124 contains the detailed per-PR Issue #107 contracts (PRs #108, #110, #113, #115, #117, #119, #121). Where older presentation wording conflicts with Issue #123, the newer Issue #123 approved direction controls.

## Results/data ownership

Issue #123 is a website redesign and conversion project. Existing source/calculation ownership remains unchanged unless an individual later PR explicitly documents a presentation-only reuse:

- **Day Trading:** existing public live/status data, open P&L where supported, realized Closed Trades ledger/equity series, and protected dashboard viewer;
- **Swing Trading:** existing Trading Lab research/model portfolio, Active Portfolio, candidates, Closed Trades, and Equity History;
- **Options:** existing owner-maintained Option Journal, closed-position/result calculation, and protected owner-provided brokerage proofs.

Do not combine unlike sources into one unexplained P&L, convert model returns into brokerage returns, fabricate missing data, or change financial calculations as part of the redesign.

## Safety boundary

PR #124 does **not** change:

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

The change is limited to public navigation, trial-link presentation, preload ordering for the presentation layer, regression tests, and handbook documentation.

## Locale/domain verification

Render reports `ru.vixale.com` among the service domains, but repository inspection has not identified a separate Russian public navigation implementation. Issue #123 PR 1 does not create a separate RU fork.

The preferred canonical public host remains `www.vixale.com`. Application-level GET/HEAD apex-to-www behavior from PR #121 remains in place. DNS/TLS edge routing and fresh user-visible public HTML remain subject to direct verification rather than crawler inference.

## Historical reference

Prior historical manifests remain available in `PROJECT-SOURCE-OF-TRUTH/`. For current website-changing production state, use this manifest plus fresh GitHub/Render/live-origin verification according to `MASTER-INDEX.md`.
