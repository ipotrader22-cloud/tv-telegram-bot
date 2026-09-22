# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-22 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #173 — `Add Options and Swing Portfolio to quick navigation`
- **PR #173 merge SHA:** `fefa6a13b1a84b3149c84577e2a11b671556a2dc`
- **Observed PR #173 state:** MERGED
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled, commit-triggered
- **Render deploy for PR #173:** `dep-dap6qoajnfac73bhe5hg`
- **Render deployed website-changing SHA:** `fefa6a13b1a84b3149c84577e2a11b671556a2dc`
- **Render deployment status:** LIVE
- **Render verification:** deployment `dep-dap6qoajnfac73bhe5hg` identifies the exact PR #173 merge SHA and reached `live` after the new-commit deploy.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-20-PR167.md` as the website-facing baseline. The intervening merged website/localization fixes through PR #172 remain part of `main` and are not rolled back by PR #173.

## PR #173 scope and behavior

PR #173 is website/navigation-only. It adds two entries to the existing compact quick-menu pattern that contains:

```text
← Back to Home
Trading Systems
Risk Management
```

The added items are:

```text
Options
-> https://www.vixale.com/trading-systems/options/viewer

Swing Portfolio
-> https://www.vixale.com/trading-systems/swing-trading
```

The implementation preserves the existing pill/link presentation by reusing the detected menu link class/style. It is idempotent and scoped to that exact quick-menu sequence rather than replacing the shared primary public navigation.

Russian localization remains on the same canonical renderer/refinement stack. `Options` maps to `Опционы`; `Swing Portfolio` maps to `Свинг-портфель`; the existing RU host localization layer remains responsible for host-appropriate internal links.

## Verification details

Repository-level checks for PR #173 covered syntax, ordering, idempotence, unrelated-navigation protection, global refinement wiring, and Russian Swing Portfolio translation.

The post-merge **Production EN/RU Browser QA** run for merge SHA `fefa6a13b1a84b3149c84577e2a11b671556a2dc` is GitHub Actions run `35724445904`.

- The main EN/RU production browser step completed **SUCCESS** across its configured 10 public routes and desktop/mobile viewports; its artifact summary reports zero configured EN/RU failures.
- The separate **RU Services form-control QA** step completed **FAILURE**. The same dedicated step also failed on the prior PR #172 production run, so this is not new evidence that PR #173 introduced the Services-control issue.
- The configured browser suite does not specifically assert the compact quick-menu shown on every route where that legacy pattern may appear. Therefore exact browser-visible quick-menu presence outside the covered assertions should not be inferred solely from the general browser PASS.

If the dedicated RU Services form-control QA remains important operationally, treat that separate check as an existing unresolved verification issue until repaired and rerun successfully.

## Safety boundary

PR #173 does **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop logic, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram lifecycle;
- public performance calculations or live-data sources;
- Swing Trading Lab scoring/selection/model portfolio logic;
- Option Journal owner-write workflow;
- authentication/authorization contracts.

It changes only public website navigation presentation/copy/link destinations.

## Source-of-Truth maintenance note

`MASTER-INDEX.md` must point to this PR173 manifest after the accompanying documentation PR is merged. For future website-facing production changes, advance the pointer again only after merge/deployment state has been directly verified. Browser-visible claims must continue to use the latest relevant live browser QA rather than assuming Render `live` alone proves visual behavior.
