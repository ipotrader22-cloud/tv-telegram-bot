# VECO Developer Handbook Addendum — Public EN/RU Production Browser QA

## Purpose

The public Vixale English and Russian websites require an independent browser-level verification path that does not depend on the assistant web-fetch environment. Render deployment status proves which source commit is deployed, but it does not prove browser-visible layout/localization behavior.

This addendum defines the production browser-QA contract for `www.vixale.com` and `ru.vixale.com`. It is website verification infrastructure only. It does not change strategy logic, signals, order handling, risk, Pine, Telegram, Google Sheets trading schemas, authentication, bridge behavior, TWS/IBKR execution, public performance calculations, or live-data authority.

## Canonical QA files

```text
.github/workflows/production-locale-browser-qa.yml
scripts/qa-production-locales.js
```

The GitHub Actions workflow runs a real headless Chromium browser through Playwright. Playwright is installed only in the ephemeral CI workspace with `npm install --no-save --package-lock=false`; it is not added to the production application dependency contract or Render start path.

## Triggers

The workflow supports:

- manual `workflow_dispatch`;
- a daily scheduled production check;
- pull-request execution when the QA runner/workflow itself changes;
- `main` pushes that touch website/runtime presentation files or the QA files.

For a `main` push, the workflow waits before browser execution so normal Render Auto-Deploy has time to settle. This delay is a practical guard, not proof of a specific Render deployment. For any claim that a particular commit is deployed, Render must still be checked independently.

## Routes and viewports

The browser runner captures paired EN/RU output at desktop and mobile viewports for these representative public routes:

```text
/
/trading-systems
/trading-systems/day-trading
/trading-systems/swing-trading
/trading-systems/options
/results
/pricing
/access
/services
/about
```

Strict regression copy assertions are intentionally concentrated on the pages that produced confirmed RU rollout failures:

```text
/
/trading-systems/day-trading
/trading-systems/options
/results
/pricing
```

The route list is representative, not exhaustive. A successful run does not imply that every unlisted public route or every possible dynamic state has been visually inspected.

## Automated assertions

For each configured route/viewpoint pair, the runner verifies as applicable:

- English and Russian HTTP responses are below 400;
- the RU document advertises a Russian `lang` value;
- the RU runtime localization marker is present;
- EN and RU agree on whether a `<main>` exists;
- EN and RU have the same top-level `<main>` child signature;
- EN and RU use the same stylesheet URL list;
- known canonical Russian text appears on the affected RU pages;
- known English/legacy regression phrases do not remain on those affected RU pages.

The automated structure comparison is intentionally presentation-safe. It does not compare text length, line wrapping, numeric market values, or every nested dynamic row, because those can legitimately differ while the page still uses the same design/component tree.

## Screenshot artifacts

Every run stores full-page paired screenshots for both hosts at desktop and mobile widths, plus:

```text
report.json
summary.md
screenshots/*.png
```

Artifacts are uploaded by GitHub Actions and retained for a bounded period. Screenshots are the manual visual evidence source for questions that cannot be proven by structural assertions, including spacing, wrapping, clipping, responsive behavior, and overall visual parity.

A screenshot artifact is evidence of what the browser rendered during that workflow run. It is not evidence that a later production deployment still renders identically.

## Source-of-Truth integration

The Website Current-State manifest should not freeze a permanent browser-verification result. Browser state is time-sensitive.

For CURRENT / PRODUCTION / DEPLOYED / CANONICAL claims:

1. read `PROJECT-SOURCE-OF-TRUTH/MASTER-INDEX.md`;
2. read the Current-State manifest it points to;
3. verify GitHub/Render for the source/deployment identity;
4. verify the latest relevant **Production EN/RU Browser QA** run when browser-visible EN/RU behavior matters;
5. inspect its `summary.md`, `report.json`, and screenshots when the claim is visual rather than purely structural.

If there is no successful relevant run after the website change being assessed, browser-visible behavior is **UNVERIFIED** even if Render is `live`.

If a run fails, report the failure rather than substituting Render deployment success as browser proof.

## Limitations

A successful automated run proves only the configured checks at the time of that run. In particular it does not by itself prove:

- pixel-identical EN/RU screenshots (Russian text naturally changes wrapping);
- absence of every possible English word across every public route;
- authenticated/private dashboard behavior;
- all dynamic data states or stale/fallback branches;
- the exact Render commit unless Render is checked separately;
- trading correctness or broker execution state.

The workflow must not submit forms, mutate customer data, write Sheets, create viewer codes, call private admin actions, or invoke trading/broker endpoints.

## Maintenance rule

When a public website PR adds a new high-value route, materially changes the EN/RU composition contract, or fixes a confirmed browser regression, update the QA route/assertion set in the same PR when practical.

Do not broaden residual-English detection into a naive rule that fails on legitimate product names or technical terms such as `Vixale`, `Telegram`, `P&L`, `Day Trading`, or ticker symbols. Prefer exact known regression phrases and approved required Russian copy.

Do not add secrets to this workflow. The configured public checks must remain runnable with repository read permission only.

## Verification of QA infrastructure changes

For changes to the QA runner/workflow:

1. run `node --check scripts/qa-production-locales.js`;
2. review the workflow YAML and trigger/path scopes;
3. open the PR and require the PR-triggered browser-QA run to execute against production when GitHub Actions permits it;
4. inspect the run summary and uploaded artifacts;
5. after an explicitly approved merge, verify the `main`-push run and its artifacts;
6. independently verify Render when making a deployed-source claim.

## Rollback

Revert the QA workflow/runner/addendum commit. This removes automated browser verification only; it does not roll back the website, localization, customer data, trading state, broker state, Google Sheets, Telegram, Pine, or TWS/IBKR behavior.
