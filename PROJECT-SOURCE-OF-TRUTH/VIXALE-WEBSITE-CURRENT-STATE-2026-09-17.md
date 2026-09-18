# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #119 — `Issue #107 PR 6: clarify evidence credibility and freshness`
- **PR #119 merge SHA:** `782d150cdf64a604b6e186a306a8cb31bc36c399`
- **Observed PR state:** MERGED
- **Feature-branch verification before merge:** new refinement Node syntax PASS; focused PR 6 semantic fixture checks PASS; branch 0 behind main; no configured GitHub Actions/status checks
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy:** `dep-damgaeks728c73c1phmg`
- **Render deployed website-changing SHA:** `782d150cdf64a604b6e186a306a8cb31bc36c399`
- **Render deployment status:** LIVE
- **Render startup verification:** build successful; Render checked out the exact PR #119 merge SHA; `npm start` launched `website_evidence_credibility_refinement.js` first in the existing preload chain; server reported port 10000; Render reported the service live
- **Fresh public HTML verification for PR #119:** **UNVERIFIED**
  - deployment/runtime state is independently verified from GitHub + Render;
  - a fresh public-origin/user-visible verification has not yet been recorded for PR #119.
- **Prior owner verification:** PR #110 homepage behavior was explicitly verified by the owner after deployment.

## PR #119 — Issue #107 PR 6

PR #119 clarifies evidence provenance, coverage, fee treatment, and freshness without changing underlying evidence calculations or sources.

Production contract:
- generic `Verified performance` wording is replaced on the targeted evidence surfaces with source-specific language;
- Day Trading public realized evidence is identified as Closed Trades ledger data;
- existing Day coverage metadata is surfaced with first/last close date, included closed-trade count, and omitted source rows when material;
- Day public realized presentation explicitly excludes open P&L and states that the website uses stored Closed Trades P&L without applying a separate website fee/commission adjustment;
- Day freshness labels describe source refresh success/staleness only and do not imply the market is open or a trade is active;
- the legacy `/pricing` evidence preview consumes the same existing public coverage metadata and no longer uses generic `Verified performance` wording;
- Swing evidence is explicitly Trading Lab research/model portfolio evidence, not broker execution or brokerage-account performance;
- Swing coverage context is summarized only from already-rendered public Equity History snapshots and displayed Closed Trades rows; existing stale/cached and delayed-quote notices remain authoritative;
- Swing active positions remain model unrealized P&L and closed positions remain model realized P&L; the website does not add a separate commission/fee adjustment to the Trading Lab model series;
- Options public evidence is explicitly the owner-entered Option Journal; protected realized equity is described as Closed-journal evidence with open records excluded;
- Options fee wording matches the existing traced formula: the stored Fees field is subtracted after contracts and multiplier; no separate fee estimate is invented;
- Options manual-record/page freshness is not described as market or trade activity;
- no simulated fallback values are introduced;
- maximum drawdown was intentionally not added because it was optional and would introduce a new metric/calculation outside the presentation-only repair needed for PR 6.

## PR #117 — Issue #107 PR 5

PR #117 simplifies Services to one intent-preserving commercial taxonomy without changing service backend routes.

Production contract:
- exactly four commercial paths: Signals & Research; Automation / Setup; Strategy Review / Development; Custom Bot / Integration;
- free viewer access is a separate small path to `/access`, not a fifth commercial service card;
- Research reuses `POST /appointment-request` with the existing `request_type=Signals & Research` field and does not ask TWS/IBKR/automation questions;
- Automation / Setup reuses `POST /appointment-request` and keeps setup/TWS/IBKR context;
- Strategy Review / Development reuses `POST /strategy-review`;
- Custom Bot / Integration reuses `POST /bot-request`;
- the legacy six-scenario Services choice block is not rendered on the canonical page;
- normal forms are not described as “Chat”;
- each service states what the visitor provides, what they get, the expected outcome, and pricing posture without inventing prices;
- Vixale’s no-account-management boundary remains visible;
- no backend route, schema, trading, auth, or execution behavior changed.

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

PR #108, PR #110, PR #113, PR #115, PR #117, and PR #119 do **not** change:

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

Use this manifest for the latest merged/deployed website-changing code state. PR #110 homepage behavior is owner-verified. PR #119 deployment/runtime is verified; its fresh user-visible public HTML remains UNVERIFIED until a direct origin/user check is recorded.
