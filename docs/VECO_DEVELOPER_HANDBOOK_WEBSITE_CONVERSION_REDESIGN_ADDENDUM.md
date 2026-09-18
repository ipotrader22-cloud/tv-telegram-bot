# VECO Developer Handbook — Website Conversion Redesign Addendum

**Applies to:** Issue #123 public website redesign, direct system navigation, commercial offer/trial presentation, homepage/system/results/pricing composition, and supporting public copy.  
**Approved direction:** 2026-09-18 owner implementation brief.  
**Status:** Active product direction; where it conflicts with earlier Issue #107 or older website audit presentation guidance, this addendum is newer and controls the customer-facing design.

## Product contract

The public website presents exactly three customer-facing system subscriptions:

- **Day Trading**
- **Swing Trading**
- **Options**

The approved commercial offer is:

- **30-day free trial:** Day Trading Telegram signals only;
- **Single System:** $49/month, customer chooses Day Trading, Swing Trading, or Options;
- **Three-System Bundle:** $99/month and includes exactly the three system subscriptions;
- bundle comparison: $48/month less than three separate $49 subscriptions;
- custom bots, setup, automation/integration work, strategy review, and bespoke development remain separate services.

Do not infer a dashboard trial duration from the Telegram trial. Do not invent automatic billing, card requirements, checkout behavior, or day-31 conversion. Swing and Options Telegram delivery is not part of this release.

## PR 1 — Direct navigation and trial-routing foundation

The shared primary public navigation is:

```text
Day Trading | Swing Trading | Options | Results | Pricing
```

Right-side actions are:

```text
Log In | Get 30 Days Free
```

Route ownership:

```text
Day Trading   -> /trading-systems/day-trading
Swing Trading -> /trading-systems/swing-trading
Options       -> /trading-systems/options
Results       -> /results
Pricing       -> /pricing
Log In        -> /dashboard
```

`/trading-systems` remains supported for old links and search traffic but is no longer a required intermediate navigation step.

The active direct page/system link exposes `aria-current="page"` and receives a non-color-only selected treatment.

On narrow layouts, the three system links remain visible as a dedicated three-item switcher without requiring a hamburger menu. Results/Pricing may collapse from the compact row; Log In and the trial CTA remain available. Layout rules must avoid overlap between the brand, actions, and system switcher.

About, Services, and Help are secondary/footer navigation rather than primary system-switching actions.

## Verified Day Trading trial destination

The existing production application already uses Telegram DM `https://t.me/tradervip22` as the operational signal-request destination. Issue #123 reuses that established destination rather than inventing a checkout or new onboarding backend.

The PR 1 navigation CTA uses a prefilled request that identifies the approved offer explicitly:

```text
Hello, I'd like to start the 30-day free Day Trading Telegram signals trial.
```

The new customer-facing trial request does not mention the older futures waitlist and does not claim that Swing or Options Telegram delivery is available.

This is a manual Telegram request path. It does not prove that trial activation occurs at link click, form submission, message send, or any other specific instant; later conversion work may add an explanatory pricing/trial screen while preserving this established operational destination.

## PR 2 — Homepage working-product opening

The owner-approved redesign intentionally supersedes the earlier Issue #107 requirement to place a long **How It Works** explanation before product data.

The homepage opening is now owned by `website_conversion_home_refinement.js` and follows this contract:

```text
short hero + working product preview
-> three concise system cards
-> remaining homepage content
```

Exact hero direction:

- H1: **Trading signals. Three systems. Your choice.**
- primary action: **Get 30 Days Free**;
- secondary action: **View Trading Results**;
- supporting line: **30-day free trial of Day Trading Telegram signals.**

Desktop composition targets approximately 40% benefit-led copy and 60% product preview. Mobile stacks the copy and preview while keeping the headline, three system choices, and useful product state near the opening screen.

### Shared commercial-offer constants

`lib/website-commercial-offer.js` is the single public presentation source for the approved commercial constants used by conversion UI:

```text
Day trial                    30 days
Single System                $49/month
Three-System Bundle          $99/month
Three separate systems       $147/month
Bundle savings               $48/month
```

It also owns the three public system labels/routes and the verified Day Trading Telegram request URL/text. This module is presentation configuration only; it does not create billing, subscription, payment, renewal, or activation behavior.

### Homepage product tabs

The first-screen preview exposes three real product choices:

```text
Day Trading | Swing Trading | Options
```

The tabs use native buttons with `role="tab"`, `aria-selected`, `aria-controls`, roving tabindex, and Left/Right/Home/End keyboard behavior. The preview maintains a stable minimum height across loading and tab changes and respects reduced-motion preferences.

**Day Trading** is selected by default and is titled **Day Trading — Live Overview**.

The Day preview does not create a second data pipeline. It mirrors the existing homepage source elements:

- Open Positions -> `vx-home-live-0`;
- Open P&L -> `vx-home-live-open-pnl`;
- Closed P&L Today -> `vx-home-live-3`;
- Total Realized P&L -> `vx-home-equity-total`;
- session/freshness state -> `vx-home-day-badge` and `vx-home-day-updated`;
- compact realized-results chart -> clone of the existing `vx-home-equity-svg`.

The underlying Day Trading source refresh, calculations, zero/missing semantics, stale handling, and live Open P&L polling remain owned by their existing modules. The conversion preview observes/mirrors those values; it must not add duplicate Day polling or recalculate P&L.

**Swing Trading** reuses the existing public `/api/swing-leaders` endpoint only when the Swing tab is first selected. It performs one lazy fetch per page load and displays only already-published fields such as active position count, potential-candidate count, up to three active portfolio rows, latest total model P&L, and the published snapshot date. It does not poll, rewrite Trading Lab output, or convert model results into brokerage performance.

Customer-facing Swing preview status uses the approved sales wording **Reviewed each trading morning / Latest published update <date>**. The preview does not repeat the older `Quotes delayed` phrase. If the public feed cannot be read, the preview shows a factual unavailable state and a link to the Swing portfolio; it does not create fallback values.

**Options** has no separate public results JSON feed in the current implementation. Therefore PR 2 does not invent one and does not expose protected journal rows. The homepage tab presents the approved daily-update product framing plus links to the public Options page and existing selected-system viewer-access journey. No sample P&L, fictitious trade, or synthetic timestamp is displayed.

### Homepage system cards

The three cards use the owner-approved product copy and remain scannable:

- Day Trading: **Watch the trades. Get the signals.**
- Swing Trading: **Follow a portfolio reviewed every day.**
- Options: **Follow positions from open to close.**

Their primary routes are the direct system pages established by PR 1. Swing's card opens the public Active Portfolio anchor directly.

## Website composition boundary

Issue #123 PR 1 and PR 2 change presentation/navigation only. They do not change:

- VECO strategy logic, signal generation, entry/exit rules, stops, targets, or risk;
- Pine;
- Render webhook/trading routes;
- local bridge, TWS, or IBKR execution;
- Telegram trade lifecycle publication;
- Google Sheet schemas or calculations;
- Swing Trading Lab ranking/selection/writer behavior;
- Option Journal owner writes or result calculations;
- dashboard/viewer authentication or authorization;
- public evidence calculations.

Issue #89 remains the owner of broad preload/HTML-rewrite consolidation. The conversion redesign may add narrow compatibility refinements required for the approved UX, but it must not silently absorb the technical-debt refactor.

## Preload ownership

For PR 2, `website_conversion_home_refinement.js` is the first preload so it receives the fully composed outbound homepage after the older homepage refinements unwind. `website_conversion_navigation_refinement.js` is immediately after it so the approved direct navigation remains the final navigation layer. `website_public_qa_refinement.js` remains after both and continues to own the existing public SEO/accessibility/canonical-host guardrails.

This ordering is intentional compatibility work for the current preload architecture and does not replace Issue #89.

## Validation

Before each Issue #123 merge:

- syntax-check new/changed refinements and focused tests when a repository checkout is available;
- run the PR-specific semantic regression;
- inspect the complete diff for `app.js`, Pine, bridge, trading/risk/order, auth, Sheet schema, Swing Trading Lab, and Option Journal behavior changes;
- confirm relevant branches are based on fresh `main`;
- confirm no fabricated trade/result values, fake success state, payment flow, or unsupported Telegram availability are introduced.

PR 2 specifically verifies:

- exact approved hero and card copy;
- 30-day Day Trading trial CTA uses the shared verified Telegram destination;
- Day preview mirrors the real existing source IDs, including `vx-home-live-open-pnl`;
- Day preview adds no interval polling;
- Swing preview reuses `/api/swing-leaders`, fetches lazily, and uses morning/daily published-update wording;
- Options preview stays within current public/protected access rules;
- tab semantics and keyboard behavior;
- 40/60 desktop composition and compact mobile hierarchy;
- prior lower Day source block remains present so the final preview can mirror working data;
- old pre-data How-It-Works wall is no longer the opening composition.

After deployment, verify the exact Render merge SHA reaches LIVE and startup shows the Issue #123 conversion home module first, navigation module second, and existing public QA module after them.

## Rollback

Revert the affected Issue #123 PR merge and restore the previous `package.json` start command. No broker, trading, Pine, Sheet, Option Journal, viewer-code, or customer-data rollback is required.
