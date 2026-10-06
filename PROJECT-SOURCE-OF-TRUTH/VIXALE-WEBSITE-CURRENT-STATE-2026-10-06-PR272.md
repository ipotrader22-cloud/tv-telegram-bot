# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Compact Swing Trading page — PR272

Website-facing PR #272, `Make Swing Trading page more compact`, was squash-merged to `main` as implementation commit:

```text
35bf42422ee6bee5ec5ad91983f58b7014fa0bd2
```

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Verified implementation deploy: `dep-db2f4qvf3r2c73fj97q0`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T13:07:36.177771Z`.

## Production source behavior

The public Swing Trading page at:

```text
/trading-systems/swing-trading
```

uses a denser Swing-only presentation:

- reduced top and bottom page padding;
- tighter hero layout and hero-copy spacing;
- tighter Swing CTA and snapshot spacing;
- denser `How Swing Leaders Works` cards with smaller gaps, padding, radius, and type;
- tighter four-card summary row;
- more compact Market Update block;
- reduced vertical spacing around Active Portfolio, Candidates, and Closed Trades sections;
- reduced table-wrapper spacing;
- dedicated compact mobile values remain in place.

The change is presentation-only. Swing portfolio content, ranking/scoring, model P&L calculations, quote refresh behavior, Trading Lab feed semantics, and trading logic are unchanged.

## Verification

Scoped pre-merge checks passed:

- `website_swing_ui_refinement.js` syntax: PASS;
- `tests/test_swing_ui_refinement.js` syntax: PASS;
- compact spacing contract: PASS;
- Swing UI refinement idempotency: PASS;
- feature branch was ahead of `main` and not behind before merge.

Render verification:

- exact implementation commit `35bf42422ee6bee5ec5ad91983f58b7014fa0bd2` checked out;
- build completed successfully;
- exact deploy `dep-db2f4qvf3r2c73fj97q0` reached **live**.

The repository PR workflow does not currently include `website_swing_ui_refinement.js` in its pull-request path filter, so no PR workflow run was expected for PR272. A push workflow run for the exact implementation commit was not visible through the available GitHub run lookup at the time this manifest was written. This is recorded as **UNVERIFIED**, not assumed either successful or failed.

**Owner visual verification of the new page density is pending** until the owner reloads and reviews the page.

## Files changed by PR272

```text
website_swing_ui_refinement.js
tests/test_swing_ui_refinement.js
```

## Safety boundary

PR272 does **not** change:

- Swing ranking/scoring logic;
- Active Portfolio/Candidates/Closed Trades feed semantics;
- model allocation or Model P&L calculations;
- Pine or TradingView strategy behavior;
- entry, exit, stop, target, sizing, timeframe, session, or risk logic;
- bridge/TWS/IBKR execution;
- Telegram lifecycle;
- Google Sheets schemas or write paths;
- authentication/viewer behavior;
- production secrets or environment values.

## Handbook

**Handbook update required: NO.**

This is an isolated visual-density cleanup and does not change the documented Swing architecture or public data contract.

## Rollback

Revert PR272 / implementation commit:

```text
35bf42422ee6bee5ec5ad91983f58b7014fa0bd2
```

and allow the normal Render deployment.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR270.md`. The PR270 manifest remains historical.
