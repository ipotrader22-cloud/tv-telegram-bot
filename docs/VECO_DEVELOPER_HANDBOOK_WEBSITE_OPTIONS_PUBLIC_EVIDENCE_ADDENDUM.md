# VECO Developer Handbook — Options Public Evidence Addendum

**Applies to:** public Options chart/journal presentation, homepage Options evidence copy, protected Options viewer/proof boundary  
**Added:** 2026-09-29  
**Issue:** #226  
**Related routes:** `/`, `/trading-systems/options`, `/trading-systems/options/viewer`, `/dashboard/options/:id/proofs/:proofId`

## Purpose and supersession

This addendum records the owner-approved public evidence change requested in Issue #226. It supersedes only the public-evidence restrictions in `VECO_DEVELOPER_HANDBOOK_WEBSITE_OPTIONS_COMMERCIAL_IA_ADDENDUM.md` that said the public Options page must not publish the Option Journal or perform an Options journal read.

The older addendum remains authoritative for the protected viewer/session reuse, protected brokerage-proof routes, Options data/calculation contract, Services scope, event-label behavior, and trading/execution boundaries unless this addendum explicitly says otherwise.

This is a website/public-presentation change only. It does not change Pine/strategy logic, signal generation, entries/exits/stops/targets, sizing/risk, Telegram lifecycle, bridge/TWS/IBKR execution, broker orders, Google Sheets writers/schema, or Options owner-entry/admin behavior.

## Public Options evidence contract

The canonical public Options route remains:

```text
/trading-systems/options
```

The page now publishes two read-only evidence views directly to unauthenticated visitors:

1. a compact cumulative realized Options P&L chart above the existing dashboard-example card; and
2. a public Option Journal table immediately below the Product Preview section.

Both use the existing authoritative worksheet/range:

```text
Option Journal!A:S
```

No new public API, database, worksheet, writer, environment variable, or simulated fallback source is introduced. The server reads the existing sheet with read-only Google Sheets credentials. A short in-process cache may be used to avoid unnecessary repeated reads.

### Public chart calculation

The public compact chart uses the same realized-P&L rules as the protected Options equity view:

- Credit: `(entry price - exit price) × contracts × multiplier - fees`
- Debit: `(exit price - entry price) × contracts × multiplier - fees`
- only rows whose status is `Closed`;
- only rows with a valid `YYYY-MM-DD` Exit Date;
- only rows with finite derived realized P&L;
- trades are grouped by Exit Date and accumulated chronologically.

Open/invalid rows are excluded from the curve. No replacement values are manufactured if the sheet read or calculation cannot produce valid points.

### Public journal fields and proof boundary

The public journal may render the trade fields already recorded in columns A:P, including open and closed position details needed to show the trade record. Customer-facing rendering may include derived realized P&L using the formula above.

Columns Q:S and existing protected brokerage-proof URLs must not be emitted by the public renderer. Existing protected proof files continue to use the authenticated route family:

```text
/dashboard/options/:id/proofs/:proofId
```

The public journal itself is the destination for the marketing link labeled `proofs`; that link must not bypass proof authentication or expose a protected proof URL.

If the journal read fails, the public page must show an unavailable state and leave the existing sales-page content intact. It must not silently substitute stale simulated rows or synthetic P&L.

## Access and conversion behavior

The homepage viewer-registration target remains:

```text
/#password-access
```

On the public Options page:

- every CTA labeled `Request Options Access` points to `/#password-access`;
- the three `WHAT YOU GET` cards are keyboard-accessible links to `/#password-access`;
- same-site access links must not open a Telegram onboarding URL;
- Results copy may describe the owner-approved real-account record and daily journal updates, with the word `proofs` linking to `#option-journal-public`.

Because the journal is now public, public copy must not say that the Option Journal/current position history is hidden behind viewer access. Homepage copy must distinguish the now-public Options chart/journal from brokerage proof files, which remain protected.

## Protected viewer contract remains unchanged

The protected route remains:

```text
/trading-systems/options/viewer
```

It continues to reuse the existing `/dashboard` authorization/session path and retains the existing protected Option Journal/equity/proof experience. Issue #226 does not weaken or replace dashboard authentication and does not change proof upload/delete/view/download behavior.

## Implementation boundary

Issue #226 is implemented as a public-response refinement layered before the existing Options sales-page refinement so it receives the final generated sales markup on the response path. The module may also normalize the homepage Options evidence sentence so the homepage does not contradict the public journal.

Expected implementation files:

```text
website_options_public_evidence_refinement.js
package.json
tests/test_options_public_evidence_refinement.js
docs/VECO_DEVELOPER_HANDBOOK_WEBSITE_OPTIONS_PUBLIC_EVIDENCE_ADDENDUM.md
```

No `app.js`, trading engine, broker bridge, Pine, Sheets writer, or Options admin write-path change is required.

## Validation

Before merge:

- syntax-check `website_options_public_evidence_refinement.js` and its focused test;
- parse `package.json` successfully;
- run `tests/test_options_public_evidence_refinement.js`;
- verify chart markup is before `#options-preview-card`;
- verify `#option-journal-public` follows the Product Preview section;
- verify all `Request Options Access` links and all three benefit cards point to `/#password-access`;
- verify Results copy links `proofs` to `#option-journal-public`;
- verify protected `/dashboard/options/.../proofs/...` values in sheet columns Q:S are never rendered publicly;
- verify sheet-read failure produces unavailable UI and no simulated replacement values;
- verify the protected `/trading-systems/options/viewer` code path is absent from the implementation diff;
- verify no trading/execution/strategy code is changed.

After an owner-authorized merge/deployment:

1. confirm the exact Render deploy reaches `live`;
2. open `/trading-systems/options` without a viewer session and verify compact chart, dashboard example, public Option Journal, access links, clickable cards, and Results copy;
3. verify the homepage Options evidence copy no longer says the journal itself is protected;
4. verify `/#password-access` still lands on the free viewer registration block;
5. verify protected brokerage proof URLs still require the existing viewer authorization;
6. inspect Render startup/application logs for new errors from the public Options evidence read.

## Rollback

Revert the Issue #226 website PR and remove the public-evidence preload from `package.json`. The prior public explainer/protected-journal presentation returns. No data migration, Option Journal cleanup, proof migration, broker/TWS action, trading-state rollback, Telegram action, or Google Sheets schema change is required.
