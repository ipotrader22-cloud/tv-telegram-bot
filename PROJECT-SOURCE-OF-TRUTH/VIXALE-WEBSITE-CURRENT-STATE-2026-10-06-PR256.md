# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Options chart marker-density refinement — PR256

Website-facing PR #256, `Reduce Options chart marker density`, was squash-merged to `main` as implementation commit `d0221e0c5f4b74e58aab11b0b02614978b057aeb`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2bp4m7bikc73dqlab0`.
Verified implementation deploy commit: `d0221e0c5f4b74e58aab11b0b02614978b057aeb`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T09:17:50.016817Z`.

A later documentation-only commit/deploy may have a newer SHA without changing the website behavior recorded here. Always re-check GitHub `main`, Render, and the public site before making CURRENT/LATEST/DEPLOYED claims.

## Production behavior

On the public `/trading-systems/options` performance chart:

- the realized P&L line, data source, cumulative realized P&L calculation, and compact 9px label styling remain unchanged;
- dense curves now render circular markers on alternating authoritative equity points instead of every point;
- the latest equity point is always marked;
- short curves with 4 points or fewer continue to show all markers;
- the change reduces marker count by approximately 50% without interpolating, removing, or changing any underlying equity data.

Examples covered by regression:
- 30 equity points -> 15 markers;
- 31 equity points -> 16 markers;
- 2 equity points -> 2 markers.

## Verification status

- PR256 pre-merge `locale-contract` completed successfully.
- Scoped regression directly verified:
  - 30 points produce 15 markers;
  - 31 points produce 16 markers;
  - short curves preserve all markers;
  - latest point remains marked;
  - realized P&L polyline remains present;
  - 9px chart label styling remains unchanged.
- Render checked out exact implementation commit `d0221e0c5f4b74e58aab11b0b02614978b057aeb`.
- Render build completed successfully.
- Startup logs directly verified `website_options_public_evidence_refinement.js` is preloaded by `npm start`.
- Startup reached `Server running on port 10000`.
- Render exact deploy `dep-db2bp4m7bikc73dqlab0` directly verified **live**.
- Direct visual browser confirmation of the new reduced marker density is **UNVERIFIED** in this maintenance run.

## Data / safety boundary

PR256 does **not** change:

- Options P&L formulas;
- Option Journal schema or writes;
- public Options performance data contract;
- proof access/protection behavior;
- authentication/viewer behavior;
- Pine, VECO strategy logic, signal generation, entry/exit/target/stop logic, sizing, or risk;
- bridge behavior or TWS/IBKR execution;
- Google Sheet schemas;
- Telegram trade lifecycle.

## Files changed by PR256

```text
website_options_public_evidence_refinement.js
tests/test_options_public_evidence_refinement.js
```

## Handbook

**Handbook update required: NO.**

This is a narrow visual-density refinement and does not introduce a new architecture, schema, environment variable, route, data contract, or operational procedure.

## Rollback

Revert PR256 / implementation commit:

```text
d0221e0c5f4b74e58aab11b0b02614978b057aeb
```

No trading-state, Option Journal, broker, Pine, or Google Sheet rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR253.md` as the website Current-State manifest. The PR253 manifest remains historical.
