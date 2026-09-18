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

## Website composition boundary

PR 1 changes presentation/navigation only. It does not change:

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

`website_conversion_navigation_refinement.js` is loaded before the existing public QA layer so it receives the final outbound HTML after the older navigation refinements unwind. It owns only the new direct public navigation, secondary/footer navigation normalization, mobile system switcher presentation, and verified Day Trading trial CTA.

This ordering intentionally lets the new approved direction supersede older Issue #107 navigation labels without rewriting unrelated page/data owners in PR 1.

## Validation

Before merge:

- syntax-check the new refinement and test;
- run the focused Issue #123 PR 1 navigation regression;
- verify Day/Swing/Options direct links on all targeted public page shapes;
- verify `aria-current` on Day, Swing, Options, Results, and Pricing;
- verify the Day Trading trial message contains the 30-day Day Trading Telegram offer and does not contain futures/Swing/Options Telegram promises;
- verify protected routes are not rewritten;
- verify `/trading-systems` remains a working route even though it is no longer primary navigation;
- inspect the complete diff for app.js, Pine, bridge, trading/risk/order, auth, Sheet schema, Swing Trading Lab, and Option Journal behavior changes;
- confirm the new module is the first preload and that the existing PR 7 public QA module remains immediately after it.

After merge, verify the exact Render merge SHA reaches LIVE and startup shows the new navigation refinement first in the preload chain.

## Rollback

Revert the Issue #123 PR 1 merge and restore the previous `package.json` start command. No broker, trading, Pine, Sheet, Option Journal, viewer-code, or customer-data rollback is required.
