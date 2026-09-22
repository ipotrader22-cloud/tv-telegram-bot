# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-22 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website state:

- **Current verified main head:** `136421b8536a0802bba3ed31ae1588fbd979508c`
- **PR #183:** `Remove stale bot source expectation from RU Services QA` — MERGED
- **PR #183 merge SHA:** `136421b8536a0802bba3ed31ae1588fbd979508c`
- **PR #182:** `Remove stale strategy source expectation from RU Services QA` — MERGED
- **PR #182 merge SHA:** `4d4740cd58212b194a012eec9a44de210431462f`
- **PR #181:** `Localize all current RU Services select labels` — MERGED
- **PR #181 merge SHA:** `d4b777703e8bdcebdd575ee28ab554637a37887b`
- **Render production service:** `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`)
- **Render deploy:** `dep-dapg0lks728c73ekeskg`
- **Render deploy commit:** `136421b8536a0802bba3ed31ae1588fbd979508c`
- **Render deploy status at direct verification:** `live`
- **Production EN/RU Browser QA run:** `35792294552`
- **Production QA result:** **SUCCESS**

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-22-PR176.md` as the website-facing baseline.

## RU Services form-control regression resolution

The former RU Services production QA failure is resolved.

The investigation established that two hidden values previously asserted by QA were historical fixture assumptions rather than current form/backend contracts:

```text
landing_strategy_form
landing_bot_form
```

### Current `/strategy-review` contract

The current form submits to:

```text
POST /strategy-review
```

The backend consumes:

```text
name
contact
market
experience
goal
rules
```

`contact` and `rules` are required by the current handler. The form does **not** submit a hidden `landing_strategy_form` source field.

### Current `/bot-request` contract

The current form submits to:

```text
POST /bot-request
```

The backend consumes:

```text
name
contact
market
platform
description
```

`contact` and `description` are required by the current handler. The form does **not** submit a hidden `landing_bot_form` source field.

### Current research semantic value

The Services research form still intentionally carries:

```html
<input type="hidden" name="request_type" value="Signals & Research" />
```

That value remains protected by the source and production QA contract.

## Russian form-control localization

The current RU `/services` presentation localizes the approved visible form-control copy while preserving submitted semantic values.

Current option values remain byte-equivalent English backend values; only their visible labels are localized. The localization/QA coverage includes the current Automation / Setup and Strategy Review / Development option sets, current placeholders, form actions, and the surviving research hidden semantic value.

The QA fixtures now mirror the current serialized forms instead of historical hidden source fields.

## Production verification details

GitHub Actions run `35792294552` was directly inspected against main head `136421b8536a0802bba3ed31ae1588fbd979508c` after Render deploy `dep-dapg0lks728c73ekeskg` reached `live`.

- `locale-contract`: **SUCCESS**
  - syntax checks: success
  - owner-requested public copy and PDF regressions: success
  - Services RU parity regression: success
  - existing Russian localization regressions: success
- `browser-qa`: **SUCCESS**
  - EN/RU production browser QA: success
  - owner copy and Trading Guide PDF live verification: success
  - **RU Services form-control QA: success**
  - browser QA artifact upload: success

The previously persistent RU Services form-control failure is therefore no longer an active production QA failure at this verified state.

## Prior website state retained

The owner-requested Swing Trading / Trading Guide / Closed Trades changes recorded in the PR176 manifest remain part of the verified site state:

- Swing Trading hero copy uses the active-portfolio wording and links `trading guide` to `/trading-guide#swing-trading`.
- The downloadable Trading Guide PDF is the repaired five-page file introduced in PR #175.
- The homepage button renders as `Closed Trades P&L`.

Those behaviors were re-checked by the `Verify owner copy and Trading Guide PDF live` step in run `35792294552`, which passed.

## Safety boundary

PRs #181–#183 and this state update do **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop rules, sizing, or risk;
- Swing Trading Lab scoring/selection/model portfolio logic;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram lifecycle;
- authentication/authorization contracts;
- public trading calculations or live-data source semantics.

PR #181 is limited to RU Services presentation/localization behavior and QA alignment. PRs #182–#183 are QA/regression-contract corrections only.

## Maintenance note

For future website-facing production changes, update this index only after merge and direct verification of repository state, deployment state, and applicable live production QA. Do not revive historical form fields in fixtures unless the live form/backend contract actually uses them.
