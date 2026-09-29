# VIXALE Website — Current-State Manifest

**Project:** VIXALE Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-29 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Day Trading compact hero deployment

Website PR #229 — `Compact Day Trading hero and use right-side space` — was merged as implementation commit:

```text
fa06c0eda8152ac31325863837c3fb58217f08bf
```

The change is presentation-only and is scoped to:

```text
/trading-systems/day-trading
```

It replaces the unused desktop whitespace beside the Day Trading intro with a compact second column that summarizes the existing ways to follow the system:

- public results link;
- existing protected Live Access destination;
- existing 30-day Telegram signals trial destination.

The existing hero CTA row remains available. At tablet/mobile widths the new second column collapses below the intro.

The added panel is bilingual for `www.vixale.com` and `ru.vixale.com`.

## Public/protected data boundary

The redesign does **not** publish sample or fabricated ticker rows and does not expose protected open/pending trade details.

The existing public Day Trading overview remains backed by the established aggregate public presentation/data flow. The redesign does not add a new API, database field, worksheet, fallback data source, trading calculation, or independent P&L calculation.

Protected Live Access remains routed through the existing homepage access boundary. The existing 30-day Day Trading Telegram trial URL is extracted from and reused from the already-rendered Day Trading CTA rather than inventing a new destination.

## Implementation files

PR #229 changed:

```text
website_day_trading_live_access_refinement.js
tests/test_day_trading_compact_hero.js
```

Focused validation before merge covered:

- JavaScript syntax;
- compact two-column insertion;
- existing trial destination preservation;
- responsive/mobile CSS;
- route isolation;
- idempotency;
- English/Russian panel copy;
- absence of fabricated sample ticker rows.

## Deployment state

PR #229's own Render deploy:

- service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- deploy: `dep-dau4i98u01pc7382long`
- commit: `fa06c0eda8152ac31325863837c3fb58217f08bf`
- reached `live` at `2026-09-29T23:27:25.462885Z`
- later deactivated normally when newer `main` commits deployed.

At the time this manifest was prepared, the latest directly verified Render deployment was:

- commit: `2aea06f49fc24e3746592835449323429278f8be`
- Render deploy: `dep-dau4mhavcj2c73egdud0`
- status: `live`
- finished: `2026-09-29T23:36:20.871392Z`

That newer deployment contains PR #229 unchanged.

## Production verification

Production EN/RU Browser QA run `36646029742` (run #107) executed against the newer deployed `main` state that contains PR #229.

For `/trading-systems/day-trading`, the captured production artifacts directly show the compact Day Trading hero and right-side access panel rendered on desktop and mobile. The English and Russian Day Trading routes both rendered the new panel and existing Live Overview successfully.

The workflow's `locale-contract` job completed **SUCCESS**, including the existing syntax/regression suite. The production browser job completed **FAILURE**, but its final report contained eight failures, all limited to the unrelated Options public realized-P&L chart introduced by PR #227. No Day Trading route failure was reported in that run. Canonical favicon production verification completed **SUCCESS**.

An earlier browser run for the PR #229 merge (`36645214187`, run #105) encountered transient Render `502 Bad Gateway` responses during its desktop pass while newer commits/deployments were arriving. Its later mobile Day Trading capture rendered the PR #229 layout successfully. The later run #107 above is the stronger Day Trading production evidence because it ran after the current deployment had settled.

Therefore the Day Trading compact-layout deployment and user-visible Day Trading rendering are **VERIFIED**. The repository-wide production browser workflow is **NOT globally green** because of the separate Options chart issue noted above; that failure must not be attributed to PR #229.

## Safety boundary

PR #229 does **not** change:

- VECO strategy logic, signal generation, entries/exits, targets, stops, sizing, or risk;
- TradingView/Pine behavior;
- TWS/IBKR execution or bridge behavior;
- Google Sheets trading data, writers, schemas, or calculations;
- Telegram trade lifecycle behavior;
- authentication/customer-access semantics;
- Day Trading P&L calculations or authoritative data sources.

It changes website presentation only.

## Handbook

**Handbook update required: NO.**

The implementation remains within the existing route-scoped Day Trading response-refinement architecture and introduces no new architecture, schema, environment variable, route contract, or data contract.

## Prior state

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-29-PR228.md` as the website-facing status record for the Day Trading compact hero deployment. PR228 remains the historical authority for the Swing Public Feed resilience incident and fix.

## Rollback

To roll back the Day Trading layout change, revert PR #229 / implementation merge commit:

```text
fa06c0eda8152ac31325863837c3fb58217f08bf
```

No data migration, trading-state rollback, broker/TWS action, worksheet rollback, or customer-data change is required.
