# VIXALE Website — Current-State Manifest

**Project:** VIXALE Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-29 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Options public chart restoration

Website PR #235 — `Preserve public Options chart through strategy composition` — was merged as:

```text
e6743c8aee65c8857eda679865cb60dda613adce
```

This fixes the missing compact realized-P&L chart on:

```text
/trading-systems/options
```

The public Options chart/journal feature originally added by PR #227 was loading its data and rendering the public journal correctly, but the later strategy-page presentation refinement rebuilt the Product Preview area from only the nested dashboard-example card. That discarded the surrounding public chart/dashboard stack before the final response reached visitors.

PR #235 changes the composition step so it preserves the full public preview stack when present and falls back to the historical dashboard/empty preview when no stack exists.

## Public Options evidence contract

The public page now preserves the intended read-only evidence presentation:

- compact cumulative realized Options P&L chart above the `Actual Options Dashboard Example` card;
- public Option Journal below the Product Preview area;
- `Request Options Access` destinations remain the homepage viewer-registration block;
- all three `WHAT YOU GET` cards remain links to the same registration block;
- the Results copy remains the owner-approved real-account/daily-update copy;
- the `proofs` link remains an in-page link to the public Option Journal;
- protected brokerage-proof URLs remain protected and are not exposed by the public renderer.

The authoritative Options evidence source remains the existing `Option Journal!A:S` read-only flow defined in the Options Public Evidence addendum. PR #235 does not add or change a data source, sheet schema, writer, API, or P&L formula.

## Root cause and implementation files

PR #235 changed:

```text
website_strategy_page_design_refinement.js
tests/test_options_public_evidence_strategy_composition.js
.github/workflows/production-locale-browser-qa.yml
docs/OPTIONS_CHART_STRATEGY_COMPOSITION_FIX.md
```

The key correction is in `consolidateOptionsStory()`:

- detect `.vx-options-public-preview-stack` inside the Options preview section;
- preserve that entire stack in the unified Options story;
- otherwise retain the previous dashboard/empty-preview fallback.

A focused regression now runs the public-evidence refinement followed by the strategy-page refinement and verifies that the chart, dashboard card, public journal, chart-before-dashboard ordering, single preview anchor, and protected-proof boundary survive the full composition.

## Deployment state

Render production service:

```text
tv-telegram-bot (srv-d86vh7j7uimc73ao479g)
```

PR #235 deployment:

- deploy: `dep-dau56h5g1s2s73frtha0`
- commit: `e6743c8aee65c8857eda679865cb60dda613adce`
- status: `live`
- finished: `2026-09-30T00:10:44.044714Z`

## Production verification

Production EN/RU Browser QA run:

```text
36648926620 (run #110)
```

Result:

```text
Failures: 0
PASS — all configured production EN/RU checks passed.
```

The `locale-contract` job completed **SUCCESS**, including the new Options public-evidence composition regression.

The full production `browser-qa` job also completed **SUCCESS** after the Render deployment settled. Its desktop and mobile English/Russian Options screenshots directly show the compact realized-P&L chart above the actual dashboard example and the public Option Journal below the preview area. The same run also passed canonical favicon, owner-copy/PDF, and RU Services form-control verification.

Therefore the Options public chart restoration is **VERIFIED DEPLOYED AND USER-VISIBLE** for the PR #235 deployment, and the configured repository-wide EN/RU production browser QA is green for that deployed commit.

## Safety boundary

PR #235 does **not** change:

- VECO strategy or signal-generation logic;
- entries, exits, targets, stops, sizing, or risk;
- TWS/IBKR execution or broker behavior;
- Pine/TradingView logic;
- Google Sheets writers, schemas, or Option Journal owner-entry behavior;
- Options realized-P&L calculation rules;
- authentication or viewer-session behavior;
- protected brokerage-proof authorization/download behavior.

This is a website response-composition and QA regression fix only.

## Prior state

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-29-PR233.md` as the website-facing Current-State record.

PR233 remains the historical authority for the Day Trading recent-signals correction. PR227 remains the historical implementation record for opening the Options chart/journal publicly, and PR231 remains the historical QA-contract alignment for that public evidence behavior.

## Rollback

To roll back the Options chart composition fix, revert PR #235 / merge commit:

```text
e6743c8aee65c8857eda679865cb60dda613adce
```

That would reintroduce the chart-stripping composition behavior while leaving the underlying PR #227 public evidence implementation in place. No data migration, worksheet rollback, trading-state rollback, broker/TWS action, or customer-data change is required.
