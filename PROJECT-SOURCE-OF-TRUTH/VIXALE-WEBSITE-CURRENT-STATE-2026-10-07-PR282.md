# VIXALE Website — Current-State Manifest

Updated: 2026-10-07 America/Indiana/Indianapolis.  
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Homepage trading-system card copy — PR282

Website-facing PR #282, `Refresh homepage trading system card copy`, was squash-merged to `main` as implementation commit:

```text
9a00ba2efa0f3a822cf29e8ce79550dbb5675d0b
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).  
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).  
Verified implementation deploy: `dep-db3dc4ek1f9s739v3ogg`.  
Verified implementation deploy commit: `9a00ba2efa0f3a822cf29e8ce79550dbb5675d0b`.  
Verified deploy status: **live**.  
Deploy finished: `2026-10-07T23:31:35.596249Z`.

Render startup evidence for that exact deploy:
- checkout of implementation commit `9a00ba2efa0f3a822cf29e8ce79550dbb5675d0b`;
- build successful;
- `npm start` executed the normal website preload chain;
- application reached `Server running on port 10000`;
- Render reported the service live.

## Verification

Pull-request workflow:
- workflow: **Production EN/RU Browser QA**
- PR run: **#170**
- result: **SUCCESS**
- locale-contract job: **SUCCESS**
- scoped October 6 homepage regression includes the new EN/RU card headings/copy and the desktop single-line Day Trading heading rule.

Post-merge production workflow:
- workflow: **Production EN/RU Browser QA**
- production run: **#171**
- head SHA: `9a00ba2efa0f3a822cf29e8ce79550dbb5675d0b`
- result: **SUCCESS**
- locale-contract: **SUCCESS**
- EN/RU production browser QA: **SUCCESS**
- canonical favicon verification: **SUCCESS**
- owner-copy / Trading Guide PDF live verification: **SUCCESS**
- RU Services form-control QA: **SUCCESS**

A generic external text crawler queried immediately after deployment still returned the pre-PR282 homepage card copy, while the exact Render deployment and post-merge Playwright production browser QA were successful. Therefore **crawler-visible cached HTML is STALE / CONFLICT OBSERVED** and must not be used to override the verified Render/browser deployment evidence until a fresh crawler fetch observes PR282.

## Public homepage card contract

The English homepage system cards now render:

### Day Trading

Heading:

```text
AI Driven Day Trading Systems
```

Copy:

```text
Live Day Trading signals are delivered instantly in real time to the website and through Telegram. All trades are recorded and posted on the website dashboard and results available on the website immediately.

Follow precise stock signals, entries, and exits. Vixale Prime closes at the end of the trading day; Vixale Edge may hold overnight.
```

The Day Trading heading has a scoped desktop-only no-wrap rule for widths above 900px; mobile retains normal wrapping.

### Swing Trading

Heading:

```text
Active Portfolio
```

Copy:

```text
10 currently best stocks chosen by Vixale proprietary stock swing ranking system. Check for new additions and exits updates published everyday around 10:00am. Active Portfolio updates in real time on the website. Robust risk management. Full automation available
```

### Options

Heading:

```text
Straddles, Calendars, Condors and More
```

The existing Options body copy and destination remain unchanged.

Russian card headings/copy were updated in the same final refinement layer for locale parity.

## Files changed by PR282

```text
website_oct6_user_friendliness_refinement.js
tests/test_oct6_user_friendliness_refinement.js
```

## Safety boundary

PR282 changes homepage copy/presentation only. It does **not** change:
- Pine or TradingView strategy behavior;
- signal generation or strategy rules;
- entries, exits, stops, targets, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram trading lifecycle;
- Google Sheets trading schemas or write paths;
- public evidence data sources;
- authentication, pricing, access, or viewer-code behavior.

## Handbook

**Handbook update required: NO.**

This is an isolated homepage copy/presentation edit. It does not change architecture, routing, schemas, reusable component contracts, deployment behavior, data ownership, trading behavior, or an existing documented convention.

## Rollback

Revert PR #282 / implementation commit:

```text
9a00ba2efa0f3a822cf29e8ce79550dbb5675d0b
```

then allow the normal Render deployment. No broker, Pine, Google Sheets trading-data, Option Journal, viewer-code, or customer-data rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR277.md` as the website-facing status manifest. The PR277 manifest remains historical.
