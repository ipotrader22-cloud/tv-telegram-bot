# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-17 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #108 — `Issue #107 PR 1: unify public navigation and results destinations`
- **PR #108 merge SHA:** `a5b87b9546e07d9ed84d5777b9d42ce7d49fbd7f`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** changed-JS syntax compilation PASS; focused navigation/CTA regressions PASS (103 assertions); PR patch whitespace/conflict scan PASS
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-dama0a3ncjis73cdoo50`
- **Render deployed website-changing SHA:** `a5b87b9546e07d9ed84d5777b9d42ce7d49fbd7f`
- **Render deployment status:** LIVE
- **Render startup verification:** build successful; `npm start` launched the expected website preload chain and service reported LIVE
- **Fresh public HTML verification:** **UNVERIFIED / CONFLICT**
  - the available external web crawler returned a pre-deploy cached snapshot containing the old navigation and CTA labels;
  - those crawler fetches did not appear in Render request logs after deployment, so they are not accepted as evidence of the new origin response;
  - current user-visible HTML must therefore not be inferred from that cached snapshot.

## PR #108 — Issue #107 PR 1

PR #108 implements only the first navigation/destination layer from Issue #107.

Production code contract after the merge:

- shared public navigation hierarchy:
  - How It Works
  - Trading Systems
  - Results
  - Services
  - Help
  - Log In
  - Request Free Access
- About is secondary/footer navigation rather than a primary first-time-visitor task;
- `/results` is the canonical system-aware evidence-routing hub;
- Day Trading, Swing Trading, and Options remain separate evidence domains;
- Options no longer reuses Day Trading performance/archive destinations;
- homepage Day/Swing/Options cards route first to their public system-introduction pages;
- Swing separates public portfolio viewing from dashboard access requests;
- access-form CTAs use request/access wording instead of implying immediate live viewing;
- the legacy pricing access CTA was corrected to match the access-form destination.

## Results ownership

`/results` does not calculate, combine, infer, or synthesize trading results.

- **Day Trading:** existing public live/realized evidence and public closed-trades archive
- **Swing Trading:** existing Swing Leaders research/model portfolio and Swing Equity History, explicitly not broker execution or brokerage-account performance
- **Options:** existing public Options evidence overview and protected Options viewer

## Safety boundary

PR #108 does **not** change:

- VECO strategy logic
- signal generation
- entry/exit conditions
- risk logic
- Pine
- bridge / TWS / IBKR execution
- Swing Trading Lab scoring / selection / writer behavior
- Option Journal owner write workflow
- Google Sheet trading schemas
- protected dashboard/viewer authentication or authorization
- `app.js`

The implementation is confined to public website navigation, routing, copy/presentation, focused regressions, and handbook documentation.

## Locale/domain verification

Render reports `ru.vixale.com` among the service domains, but repository search found no separate Russian-locale or host-specific navigation implementation. PR #108 does not add a locale-specific branch. Current origin HTML for each public domain remains subject to the public verification caveat above.

## Historical manifest

The prior verified website state remains available at:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-16.md`

Use this manifest for the latest merged/deployed website-changing code state. For user-visible HTML claims, preserve the **UNVERIFIED / CONFLICT** status until a fresh origin response is directly verified.
