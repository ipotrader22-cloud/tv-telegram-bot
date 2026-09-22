# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-22 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #176 — `Fix Closed Trades P&L rendering and verify live guide`
- **PR #176 merge SHA:** `63be79e7527ca6273d56ba861f427a63f6129b66`
- **Observed PR #176 state:** MERGED
- **Underlying requested feature merge:** PR #175 — `Update Swing copy and repair Trading Guide PDF`
- **PR #175 merge SHA:** `1c197caf24e122c9a0a6df98d07bfabc0ff2f279`
- **Current main head at verification:** `be8af8d6373a3ec05881b1f907d549dfa928f12b`
- **PR #177:** QA-only follow-up (`Make owner live QA resilient to active homepage requests`); it changes the verifier, not website runtime behavior.
- **Production EN/RU Browser QA:** GitHub Actions run `35744599261` against current main head `be8af8d6373a3ec05881b1f907d549dfa928f12b`.
- **Requested-change live verification:** SUCCESS — the dedicated `Verify owner copy and Trading Guide PDF live` step passed after the main EN/RU production browser step also passed.
- **Render exact deploy ID/status for this change:** **UNVERIFIED in this manifest update**. The public production checks above directly reached the live EN/RU sites and passed the requested copy/link/PDF assertions; no exact Render deploy record is claimed here without a direct Render read.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-22-PR173.md` as the website-facing baseline.

## PR #175 / #176 scope and behavior

The owner-requested public website changes are now represented in `main` as follows:

1. On `/trading-systems/swing-trading`, the hero description is:

```text
Active Portfolio based on Vixale's proprietary ranking system.
Positions are added and closed daily. Updated every morning around 10:00 am.
Refer to the trading guide.
```

`trading guide` links to:

```text
https://www.vixale.com/trading-guide#swing-trading
```

The Russian host uses the same canonical rendering/localization stack and receives Russian presentation copy plus the host-appropriate internal link.

2. The Trading Guide PDF source was replaced with a newly generated five-page PDF and validated for PDF signature, EOF, page count, renderability, and byte consistency with the encoded repository source. PR #175 recorded SHA-256:

```text
bb51f6ca9baaec0bf10d200f8f308b765ec18ebe1db54ac991c9316bc6fa2c9f
```

3. The homepage Closed Trades button now renders visibly as:

```text
Closed Trades P&L
```

PR #176 specifically corrected the remaining HTML-escaping defect that had displayed `P&amp;L` literally in production.

## Production verification details

GitHub Actions run `35744599261` is the latest directly inspected production verification for this state.

- `locale-contract` job: **SUCCESS**
  - syntax checks: success
  - owner-requested public copy and PDF regressions: success
  - Services RU parity source regression: success
  - existing Russian localization regressions: success
- `browser-qa` job:
  - main EN/RU production browser QA: **SUCCESS**
  - dedicated owner copy and Trading Guide PDF live verification: **SUCCESS**
  - RU Services form-control QA: **FAILURE**

The RU Services form-control failure is a separate pre-existing verification issue and is not evidence that the Swing copy, Trading Guide PDF, or Closed Trades label failed. The dedicated requested-change live step passed on the same run.

## Safety boundary

PRs #175–#177 do **not** change:

- VECO strategy logic, signal generation, entry/exit/target/stop rules, sizing, or risk;
- Swing Trading Lab scoring/selection/model portfolio logic;
- TradingView/Pine behavior;
- TWS/IBKR execution or local bridge behavior;
- Google Sheets trading schemas/calculations;
- Telegram lifecycle;
- authentication/authorization contracts;
- public trading calculations or live-data source semantics.

The changes are limited to public website copy/presentation, Russian localization support, the downloadable Trading Guide PDF asset, and production QA.

## Source-of-Truth maintenance note

For the next website-facing production change, advance `MASTER-INDEX.md` only after merge and direct production verification. If Render deployment metadata is needed for a future exact deployment claim, read it directly and record the deploy ID/status rather than inferring it from GitHub state.
