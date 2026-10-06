# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Options public performance chart refinement — PR253

Website-facing PR #253, `Refine Options performance chart labels and markers`, was squash-merged to `main` as implementation commit `6da93a93d91ccae876d3e91744a35b66bd4e7c91`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2bi2flk1mc738ns1j0`.
Verified implementation deploy commit: `6da93a93d91ccae876d3e91744a35b66bd4e7c91`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T09:02:52.537316Z`.

A later documentation-only commit/deploy may have a newer SHA without changing the website behavior recorded here. Always re-check GitHub `main`, Render, and the public site before making CURRENT/LATEST/DEPLOYED claims.

## Production behavior

On the public `/trading-systems/options` page:

- the existing realized P&L line and authoritative Options equity data remain unchanged;
- SVG X/Y chart labels use a reduced 9px source size instead of 14px so the stretched chart card does not visually overpower the Total Realized value;
- every existing daily equity point now receives a circular marker;
- the prior marker suppression for curves longer than 24 points has been removed;
- the chart still uses the existing Option Journal-derived cumulative realized P&L calculation and existing public evidence path;
- EN/RU page composition, navigation, journal data, proof protection, and subscription behavior are unchanged.

## CI blocker found and repaired — PR254

During the PR253 merge gate, the repository's existing `locale-contract` workflow exposed a pre-existing regression from the earlier Options Results chart work: the runtime Russian localization patterns translated Day and Swing dynamic chart aria labels but omitted `Options realized P&L history; latest ...`.

PR #254, `Fix Russian Options Results runtime aria label`, added only the missing runtime translation pattern in `website_russian_localization.js`.

PR254 squash merge commit: `f4581b948be301d3a87bcf8c2880213874e3aca7`.
Verified Render deploy: `dep-db2bh17avr4c73ag0jv0`.
Verified PR254 deploy status: **live**.

This localization repair changes accessibility/runtime localization only and does not change Options calculations, chart data, trading logic, routing, or execution.

## Verification status

- PR253 final EN/RU locale workflow run `37440041368` completed successfully after synchronization with the PR254 localization baseline.
- Options public evidence regression passed in GitHub Actions, including:
  - syntax checks;
  - public evidence composition;
  - one circular marker per plotted point;
  - explicit 30-point curve coverage;
  - unchanged authoritative equity source/calculation behavior.
- Render checked out exact PR253 implementation commit `6da93a93d91ccae876d3e91744a35b66bd4e7c91`.
- Render build completed successfully.
- Startup logs directly verified both `website_russian_localization.js` and `website_options_public_evidence_refinement.js` are preloaded by `npm start`.
- Startup reached `Server running on port 10000`.
- Render exact PR253 deploy `dep-db2bi2flk1mc738ns1j0` directly verified **live**.
- External text fetch confirms the public Options page remains reachable, but that surface is cached and does not expose reliable rendered SVG/CSS geometry. Direct visual browser confirmation of the new marker/label appearance is therefore **UNVERIFIED** in this maintenance run.

## Data / safety boundary

PR253 and the prerequisite PR254 do **not** change:

- Options P&L formulas;
- Option Journal schema or writes;
- public Options performance data contract;
- proof access/protection behavior;
- authentication/viewer behavior;
- Pine, VECO strategy logic, signal generation, entry/exit/target/stop logic, sizing, or risk;
- bridge behavior or TWS/IBKR execution;
- Google Sheet schemas;
- Telegram trade lifecycle.

## Files changed by PR253

```text
website_options_public_evidence_refinement.js
tests/test_options_public_evidence_refinement.js
```

PR254 changed only:

```text
website_russian_localization.js
```

## Handbook

**Handbook update required: NO.**

These changes refine public presentation and repair an existing runtime translation pattern. They do not introduce a new architecture, schema, environment variable, route, data contract, or operational procedure.

## Rollback

For the chart refinement, revert PR253 / implementation commit:

```text
6da93a93d91ccae876d3e91744a35b66bd4e7c91
```

For the Russian aria-label repair, revert PR254 only if deliberately restoring the prior broken locale contract.

No trading-state, Option Journal, broker, Pine, or Google Sheet rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-06-PR251.md` as the website Current-State manifest. The PR251 manifest remains historical.
