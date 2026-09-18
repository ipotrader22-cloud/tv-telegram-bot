# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-17 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #110 — `Issue #107 PR 2: make homepage intuitive for first-time visitors`
- **PR #110 merge SHA:** `bc45c8f0156a1c851b822ff165de603b1e54c6c7`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** changed-JS syntax compilation PASS; focused homepage/navigation regressions PASS (56 assertions); PR patch whitespace/conflict scan PASS
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damag3n40ujc73at0hlg`
- **Render deployed website-changing SHA:** `bc45c8f0156a1c851b822ff165de603b1e54c6c7`
- **Render deployment status:** LIVE
- **Render startup verification:** build successful; Render checked out the exact PR #110 merge SHA, `npm start` launched the expected website preload chain, the server reported port 10000, and Render reported the service LIVE
- **Fresh public HTML verification:** **OWNER VERIFIED**
  - after the PR #110 deployment, the owner explicitly confirmed the new homepage behavior was verified in production;
  - GitHub + Render deployment/runtime evidence remains independently verified as recorded above.

## PR #110 — Issue #107 PR 2

PR #110 implements only the homepage first-time-visitor hierarchy layer from Issue #107.

Production code contract after the merge:

- the approved H1 remains **See how our trading systems perform before you commit.**;
- the hero has one primary acquisition CTA, **Request Free Access**, plus secondary **Explore Results**;
- returning-user **Log In** remains in the shared header instead of competing as a full-size hero CTA;
- the top homepage sequence is:
  - Hero
  - How It Works
  - Day / Swing / Options comparison
  - authentic Day Trading evidence preview
  - existing detailed Day Trading evidence
  - existing access/downstream content;
- the How It Works section explains:
  - explore systems;
  - review available evidence;
  - request viewer access if useful;
  - viewer access is read-only;
  - setup / automation / custom development are separate services;
  - Vixale does not trade or manage customer brokerage accounts;
- the homepage comparison is category-first and uses beginner-facing dimensions such as holding horizon, how often to check, public evidence, and viewer-access boundary;
- internal strategy names are intentionally deferred until the visitor reaches the system pages;
- Day Trading copy does not falsely imply that every Day Trading position must close intraday;
- the homepage evidence preview reuses the existing Day Trading source/freshness mirrors and does not synthesize replacement values;
- the older lower **New to trading systems? Start here.** block is removed to avoid duplicate beginner guidance.

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

PR #108 and PR #110 do **not** change:

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

Use this manifest for the latest merged/deployed website-changing code state. PR #110 user-visible homepage behavior is owner-verified; future website changes still require their own post-deploy verification.
