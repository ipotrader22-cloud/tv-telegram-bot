# VIXALE Website — Current-State Manifest

**Project:** VIXALE Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-29 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Day Trading recent-signals correction

Website PR #233 — `Replace duplicate Day Trading access panel with recent signals` — was merged as:

```text
1cd6841cb31f6846ba96227424d25265722d25a9
```

The change corrects the right-side hero card on:

```text
/trading-systems/day-trading
```

The prior `Choose how to follow` card duplicated the CTA/access information already present on the left side of the hero. PR #233 replaces that duplicate card with a compact `Recent Day Trading Signals` panel.

## Public data source and boundary

The recent-signals panel does not publish fabricated sample tickers and does not expose protected Open Positions or Pending rows.

It fetches the already-public server-rendered:

```text
/closed-trades
```

and displays the five most recent rows already visible in the public Closed Trades ledger. The panel reuses only public fields already rendered there:

- close time;
- symbol;
- side;
- entry;
- exit;
- size;
- realized P&L / close event.

The existing protected open/pending trade boundary remains unchanged. The panel footer explicitly states that open and pending details remain protected.

The `Live on Telegram` action reuses the existing Day Trading trial destination extracted from the current hero CTA. No new onboarding URL is invented.

## Presentation

Desktop:

- left column keeps the Day Trading title, description, `Get 30 Days Free`, `Live Access`, and `View Day Trading Results` actions;
- right column now contains real recent public Day Trading closed-signal rows instead of duplicate access copy;
- the existing `Day Trading — Live Overview` remains immediately below the hero.

Mobile:

- the recent-signals card stacks below the existing hero CTAs and above the Live Overview;
- rows remain compact and readable without horizontal overflow.

English and Russian variants are supported.

## Implementation files

PR #233 changed:

```text
website_day_trading_live_access_refinement.js
tests/test_day_trading_compact_hero.js
```

No `website_public_performance.js` contract was widened. In particular, `/public-performance.json` still does not expose trade-level symbols or open/pending details.

## Deployment state

Render production service:

```text
tv-telegram-bot (srv-d86vh7j7uimc73ao479g)
```

PR #233 deployment:

- deploy: `dep-dau52i3rjlhs73cfot40`
- commit: `1cd6841cb31f6846ba96227424d25265722d25a9`
- status: `live`
- finished: `2026-09-30T00:02:34.058583Z`

## Production verification

Production EN/RU Browser QA run:

```text
36648193205 (run #108)
```

The production screenshots directly verify the new Day Trading recent-signals panel on both desktop and mobile. The rendered panel contains real rows from the public Closed Trades ledger and no duplicate `Choose how to follow` card.

The run's `locale-contract` job completed **SUCCESS**. The browser QA job completed **FAILURE** because of eight pre-existing/unrelated Options public realized-P&L chart assertions. All eight reported failures are confined to `/trading-systems/options`; no Day Trading failure was reported. Canonical favicon verification completed **SUCCESS**.

Therefore the PR #233 Day Trading correction is **VERIFIED DEPLOYED AND USER-VISIBLE**. Repository-wide browser QA is not globally green because of the separate Options issue.

## Safety boundary

PR #233 does **not** change:

- VECO strategy or signal-generation logic;
- entries, exits, targets, stops, sizing, or risk;
- TWS/IBKR execution or broker behavior;
- Google Sheets writer/schema behavior;
- Day Trading P&L calculations;
- public-performance aggregate contract;
- authentication or protected open/pending trade access.

This is a website presentation/read-only public-ledger reuse change only.

## Handbook

**Handbook update required: NO.**

No new architecture, schema, environment variable, trade lifecycle, execution path, or customer-data contract is introduced.

## Prior state

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-29-PR229.md` for the Day Trading hero presentation. PR229 remains the historical record for the initial compact two-column hero deployment.

## Rollback

To roll back this correction, revert PR #233 / merge commit:

```text
1cd6841cb31f6846ba96227424d25265722d25a9
```

No data migration, worksheet rollback, trading-state rollback, broker/TWS action, or customer-data change is required.
