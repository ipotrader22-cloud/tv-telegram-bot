# VECO Developer Handbook — Website Preload Consolidation Addendum

**Applies to:** Issue #89 first implementation stage; website presentation preload ownership only  
**Added:** 2026-09-09  
**Primary files:** `package.json`, `website_about_refinement.js`, `website_about_copy_polish.js`

## Purpose

This addendum records the first low-risk consolidation step for the website preload / emitted-HTML refinement chain. It changes module ownership and startup composition only. It does not change public copy, routes, authentication, data sources, Google Sheets, Telegram, Pine, strategies, signals, risk, bridge behavior, TWS/IBKR execution, broker orders, Swing automation, or Option Journal writers.

## Prior composition

The production start command separately preloaded both About presentation modules:

```text
-r ./website_about_copy_polish.js
-r ./website_about_refinement.js
```

`website_about_copy_polish.js` installed its Express wrapper first. `website_about_refinement.js` then captured that wrapped Express factory and installed the broader About refinement. On response send, the main About renderer ran before the copy-polish transform, so the final `/about` output received both the About page composition and the existing founder-sentence/style polish.

## Consolidated composition

The first Issue #89 stage removes `website_about_copy_polish.js` from the top-level `npm start` `-r` list. `website_about_refinement.js` becomes the single top-level About preload and explicitly requires `website_about_copy_polish.js` before it captures `Module._load`.

Required order:

```text
npm start
-> preload website_about_refinement.js
   -> require website_about_copy_polish.js
      -> install copy-polish Express wrapper
   -> capture Module._load
   -> install About refinement wrapper
-> app.js requires express
-> copy-polish middleware is installed first
-> About refinement middleware is installed second
-> response transform order remains About refinement, then copy polish
```

This intentionally preserves the existing emitted HTML while reducing top-level website preloads from 23 to 22.

`website_about_copy_polish.js` remains a focused helper/preload module in this stage. It is no longer a separate startup entrypoint; it is owned by the About refinement cluster. A later Issue #89 stage may internalize or replace that helper only under a separate narrow regression-tested PR.

## Ownership boundary

The About cluster owns:

- `/about` page composition;
- About metadata/canonical presentation;
- homepage founder/credibility presentation already owned by the About refinement;
- the existing copy-polish removal of the founder sentence;
- the existing copy-polish About heading style override.

This stage does not move unrelated homepage, trading-system, pricing, navigation, performance, dashboard, or access refinements into the About cluster.

## Validation contract

Before merge:

- `package.json` has 22 `website_*.js` top-level `-r` preloads;
- `website_about_copy_polish.js` is absent from the top-level start command;
- `website_about_refinement.js` explicitly requires it before capturing `Module._load`;
- `node --check app.js`;
- syntax-check both About modules and the new consolidation test;
- run `tests/test_issue89_about_preload_consolidation.js`;
- run `tests/test_about_copy_polish.js`;
- run `tests/test_about_refinement.js`;
- run selected shared navigation/homepage presentation regressions;
- confirm `/about` still contains the About refinement stylesheet and copy-polish stylesheet;
- confirm the founder sentence remains removed;
- confirm the canonical remains `https://www.vixale.com/about`;
- confirm no bridge, Pine, trading, TWS/IBKR, auth, Sheets, Swing writer, or Option Journal writer files are in the diff.

## ADR-WEB-007 — Consolidate website preloads by explicit cluster ownership, one low-risk group at a time

**Decision:** Reduce the website `-r` chain incrementally. For the first stage, make `website_about_refinement.js` the explicit top-level owner of the existing About copy-polish dependency while preserving its middleware installation order and output behavior.

**Reason:** The long preload chain makes ordering dependencies implicit and raises regression risk. A narrow cluster migration provides a reversible pattern: remove one top-level preload, make ownership explicit inside the remaining cluster entrypoint, prove before/after behavior with focused integration tests, then stop. This avoids a broad rewrite of working website presentation code.

**Data/schema impact:** None.

**Auth impact:** None.

**Execution impact:** None.

**Deployment impact:** The `npm start` command has one fewer top-level website preload. Render remains commit-triggered from `main`; no environment or service-setting change is required.

## Rollback

Revert the Issue #89 first-stage PR. That restores the separate `-r ./website_about_copy_polish.js` startup entry and removes the explicit cluster dependency. No data migration, auth rollback, Sheets cleanup, Telegram action, bridge restart procedure, TWS action, or IBKR action is required beyond the normal service redeploy caused by reverting website code.
