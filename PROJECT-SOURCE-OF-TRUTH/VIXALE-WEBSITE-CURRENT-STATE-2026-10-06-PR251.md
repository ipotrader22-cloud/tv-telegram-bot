# VIXALE Website — Current-State Manifest

Updated: 2026-10-06 America/Indiana/Indianapolis.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Options Results card refinement — PR251

Website-facing PR #251, `Refine Options results card chart presentation`, was squash-merged to `main` as implementation commit `b38d8502c50dc400a411ff894f92debc7e3c3557`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Verified implementation deploy: `dep-db2b8ig473hc739cnr7g`.
Verified implementation deploy commit: `b38d8502c50dc400a411ff894f92debc7e3c3557`.
Verified deploy status: **live**.
Deploy finished: `2026-10-06T08:42:37.773512Z`.

A later documentation-only commit/deploy may have a newer SHA without changing the website behavior recorded here. Always re-check GitHub `main`, Render, and the public site before making CURRENT/LATEST/DEPLOYED claims.

## Production behavior

The public `/results` Options card keeps the existing owner-entered Options realized-equity feed and cumulative realized P&L calculation introduced by PR #250. PR #251 changes presentation only:

- every daily Options equity point is rendered with a circular marker;
- X-axis date ticks are selected from existing equity-curve dates at approximately weekly intervals and capped to avoid label crowding;
- first/last date visibility remains preserved when valid date data is available;
- `Total Realized P&L` is moved into the Options card header beside/before the existing `Open Options →` CTA;
- the standalone full-row Options metric block is removed;
- the Options chart uses a larger chart area;
- the whole Options card remains keyboard/click navigable to `/trading-systems/options`.

The Day Trading and Swing Trading chart calls keep their existing rendering behavior. The Options-only chart flags enable all-point markers, weekly dates, and the larger chart height.

## Verification status

- GitHub `main` directly verified at implementation commit `b38d8502c50dc400a411ff894f92debc7e3c3557` immediately after PR #251 merge.
- PR #251 was exactly based on prior `main` `927ccb3c1ab4f6e07f1de3f0258ea2643e6e6c62` and changed only:
  - `website_conversion_results_refinement.js`
  - `tests/test_results_chart_refinement.js`
- Scoped module syntax, generated inline-script syntax, test-file syntax, and `test_results_chart_refinement.js` assertions passed before merge.
- Render auto-deploy was directly verified enabled for branch `main`.
- Render checked out exact implementation commit `b38d8502c50dc400a411ff894f92debc7e3c3557`.
- Render build completed successfully.
- Startup logs directly verified `website_conversion_results_refinement.js` is preloaded by `npm start` and the service reached `Server running on port 10000`.
- Render exact deploy `dep-db2b8ig473hc739cnr7g` directly verified **live**.
- Direct external fetch/browser verification of `https://www.vixale.com/results` and `https://ru.vixale.com/results` is **UNVERIFIED** in this maintenance run because the available external fetch surfaces could not resolve/access those hosts. Do not upgrade this to browser-verified until checked from an accessible external browser.

## Data / safety boundary

PR #251 does **not** change:

- Options P&L formulas or the public Options performance endpoint/data contract;
- Option Journal rows, writes, brokerage proofs, or Google Sheet schemas;
- viewer/authentication behavior;
- VECO strategy logic, signal generation, Pine, entries/exits, targets/stops, sizing, or risk;
- bridge behavior or TWS/IBKR execution;
- Telegram trade lifecycle behavior.

This is website presentation only.

## Files changed by PR251

```text
website_conversion_results_refinement.js
tests/test_results_chart_refinement.js
```

## Handbook

**Handbook update required: NO.**

PR #250 already documented the public Options results/feed architecture in `docs/VECO_DEVELOPER_HANDBOOK.md`. PR #251 only refines that card's presentation and does not introduce a new architecture, schema, environment variable, route, or data contract.

## Rollback

Revert PR #251 / implementation commit:

```text
b38d8502c50dc400a411ff894f92debc7e3c3557
```

No trading-state, Option Journal, broker, Pine, or Google Sheet rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-01-PR247.md` as the website Current-State manifest. The PR247 manifest remains historical.
