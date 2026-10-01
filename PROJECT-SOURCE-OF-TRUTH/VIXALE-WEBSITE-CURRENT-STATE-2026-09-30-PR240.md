# VIXALE Website — Current-State Manifest

Updated: 2026-09-30 America/New_York (production verification 2026-10-01 UTC).
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Latest verified header and introduction refinement (PR242 / PR243)

PR242 (`6b1afea9ffe532c45550523321d3e35958199431`) makes table headings
bold (700), centered, and single-line. Compact Qty/Expiry/Cr-Db/price labels
retain full-label hover titles; mobile cards retain full field labels. The
existing card layout now applies through 900px to avoid squeezing thirteen
columns on tablets. No horizontal table scrolling was introduced.

PR243 (`c9bae8d2618bf7d23f74dff109b564dde6b923c9`) changes the introduction to:

> Every trade, from entry to exit.
>
> Explore our options trades, review the results, and read the notes behind each position.

Russian copy: “Каждая сделка — от входа до выхода.” and “Смотрите наши опционные
сделки, результаты и комментарии к каждой позиции.”

Exact final code deploy: `dep-daut9htg1s2s73d1fn80`, commit
`c9bae8d2618bf7d23f74dff109b564dde6b923c9`, verified **live** at
`2026-10-01T03:35:01.432975Z`. Startup logs confirm port 10000 and live status.
PR242's preceding deploy was `dep-daut5nvf3r2c7389598g`.

Live Chrome checks passed in EN/RU at 1440/1024/768/390/320px, including exact
new introduction, computed bold/center/nowrap styles, header text fit, no
horizontal overflow, eight initial rows, all 47 trades on expansion, Notes/proof
order, protected-proof redirects, chart/grid preservation, and CTA clicks.
Desktop and mobile screenshots were inspected.

PR242 production QA run `36810507222` passed. PR243 production run
`36811135801` passed both locale-contract and browser-qa jobs.

Runtime changes are limited to the public Options renderer and copy expectations
in the existing browser QA script. No formulas, data sources, admin actions,
authentication, Sheets writers, or trading/execution behavior changed.
Rollback the copy with PR243's merge commit; rollback header styling with
PR242's merge commit. No data rollback is required.

## Verified public Options journal and chart

The public `/trading-systems/options#option-journal-public` journal now includes
Notes between P&L and Proofs, sourced from the same Option Journal column Q used
by `/admin/live`. Notes are escaped plain text, wrap within their column, retain
line breaks, and display a dash when empty. Thirteen percentage-width columns
total 100% of the existing desktop content width. Mobile uses labeled trade cards.

This builds on PR238's compact table, proof availability, eight-row initial view,
Show More/Show Less, and chart date/dollar ticks with dotted gridlines, plus PR239's
mobile date-cell width correction. All history remains accessible; the realized
P&L calculation and chart/dashboard/journal order are unchanged.

## Merges and deployments

| Change | PR | Merge commit | Render deploy |
| --- | --- | --- | --- |
| Public journal/proofs/chart | #238 | `d549d08977cbeedc2e990c04c60c278022fa6da7` | `dep-dauflr0u01pc738ed940` |
| Mobile date readability | #239 | `d28f14cf0babff75a7a452f24379885890fa5680` | `dep-daufngjbc2fs73cjkbig` |
| Public Notes | #240 | `fad9516f9985f005775156c9b6ce3c803a535866` | `dep-daut0cbncjis73ctikl0` |

Render service: `tv-telegram-bot` / `srv-d86vh7j7uimc73ao479g`.
Auto-deploy from main is enabled. The exact PR240 deployment reached **live** at
`2026-10-01T03:15:57.77607Z`. Startup logs confirmed listening on port 10000 and live status.

## Production verification

Targeted live Chrome QA passed on both `www.vixale.com` and `ru.vixale.com` at
1440, 1024, 768, 390, and 320 pixels after PR240 reached live. Screenshots inspected.

- Notes is the penultimate column, between P&L and Proofs; real notes and empty-note dashes are visible.
- No page/table/wrapper horizontal overflow; P&L, Notes, and Proofs all fit on desktop.
- Eight newest trades initially; Show More reveals all 47 current trades; Show Less restores eight.
- Mobile date cells remain readable (170px at 390px viewport, 135px at 320px).
- Date/dollar ticks and multiple dotted gridlines visible; chart before dashboard example, journal after preview.
- Multiple-proof disclosure works; 48 proof links across the full current history.
- Anonymous proof requests redirect HTTP 302 to `/login`; no admin controls are rendered.
- Access CTA and benefit-card clicks reach the homepage registration form in EN/RU at desktop/mobile sizes.

Production EN/RU workflow for PR239: `36712897398`, verified **success**.
Production EN/RU workflow for PR240: `36809628457`, verified **success** (locale-contract and browser-qa).
Both PR240 and PR239 pre-merge locale-contract checks passed. Focused Options
evidence/composition/canonical, Russian localization/current-page, owner-copy,
changed-JS syntax, and long-note responsive checks passed.

## Data and security boundary

Trade source remains read-only `Option Journal!A:S`; Q is Notes, R/S are timestamps.
Proof metadata remains existing `Option Proofs!A2:G`. Only validated IDs construct
existing authenticated `/dashboard/options/:id/proofs/:proofId` links. Storage keys,
filenames, credentials, and owner actions remain excluded. Notes publication was
explicitly requested by the owner; it does not change proof authorization.

No changes to app.js, Sheets writers/admin logic/schema, trading/strategy/signals,
entries/exits/sizing/risk, Pine, bridge, TWS/IBKR, broker behavior, or realized P&L.
Marketing copy, subscription sections, dashboard example, access CTAs, and EN/RU
compatibility remain intact.

## Files and rollback

PR240 changed `website_options_public_evidence_refinement.js`, both existing
Options public-evidence test files, `scripts/qa-production-locales.js`, and
`docs/VECO_DEVELOPER_HANDBOOK.md`.

To remove Notes only, revert merge `fad9516f9985f005775156c9b6ce3c803a535866`
through a PR and verify the auto-deployed page. To remove the preceding journal/chart
upgrade as well, also revert PR239 then PR238. No sheet, proof-file, customer-data,
trading-state, or broker rollback is needed. Do not remove the persistent proof disk.

This supersedes the PR235 manifest for the Options public-page state. PR235 remains
the historical chart-composition fix; other website sections retain their existing
source-of-truth records. A documentation merge after this verified code deployment
does not itself change website runtime code.
