# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-17 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #115 — `Issue #107 PR 4: add dedicated access journey`
- **PR #115 merge SHA:** `fb3841431de1b7f2026bc2c0abcc684942c070d0`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** changed-JS/test syntax compilation PASS; focused PR 4 regressions PASS (36 assertions); PR patch whitespace/conflict scan PASS
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damaq1jtqb8s73bi8dig`
- **Render deployed website-changing SHA:** `fb3841431de1b7f2026bc2c0abcc684942c070d0`
- **Render deployment status:** LIVE
- **Fresh public HTML verification:** **UNVERIFIED**
  - the available external browser could not access the cache-busted `/access` URL during verification;
  - GitHub + Render deployment/runtime state is verified independently.
- **Prior owner verification:** PR #110 homepage behavior was explicitly verified by the owner after deployment.

## PR #115 — Issue #107 PR 4

PR #115 adds the dedicated public `/access` journey without changing the secured access backend.

Production contract:
- `/access` is the canonical acquisition route;
- request → email verification → manual review → viewer code if approved → login is explained before submission;
- access is free and read-only;
- the verification link is accurately described as expiring after 60 minutes;
- public copy does not promise a fixed viewer-code duration;
- Day Trading dashboard and protected Options viewer are the protected viewer surfaces; Swing portfolio remains public;
- system-origin context is stored only in the existing `Dashboard Access Requests.Source` field;
- `/#password-access` and the homepage access form remain backward-compatible;
- Turnstile, approval, viewer-code/session/expiry behavior, protected auth, and Sheet schema are unchanged;
- funnel measurement counts dedicated and legacy access CTAs through the existing event.

## PR #113 — Issue #107 PR 3

PR #113 standardizes the public system-page teaching sequence while preserving each system's existing evidence and auth owners.

Production code contract after the merge:

- Trading Systems landing is category-first and compares Day / Swing / Options by holding horizon, how often to check, public availability, and viewer-access boundary before internal strategy names;
- Day Trading explains the category before Prime / Edge, keeps Day-specific evidence links, and states accurately that approved Edge positions can remain open overnight;
- Swing keeps the existing public research/model portfolio and data feed intact, adds explanation before the live portfolio, keeps delayed/model disclosures, and makes **View Swing Portfolio** the page-specific next action;
- Swing viewer login is not presented as a prerequisite for the public Active Portfolio;
- Options explains that its evidence comes from the owner-entered Option Journal and keeps protected journal rows, closed-only realized equity, and owner-provided proofs behind the existing viewer auth;
- each system page follows the semantic order: what it is → how it differs → what the visitor sees → what is public → what viewer access adds → system-specific evidence/results → one clear page-specific next action;
- no Day / Swing / Options evidence sources are merged or recalculated.

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

PR #108, PR #110, PR #113, and PR #115 do **not** change:

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

Use this manifest for the latest merged/deployed website-changing code state. PR #110 homepage behavior is owner-verified. PR #113 public HTML remains UNVERIFIED until a fresh origin/user check confirms the deployed system-page presentation.
