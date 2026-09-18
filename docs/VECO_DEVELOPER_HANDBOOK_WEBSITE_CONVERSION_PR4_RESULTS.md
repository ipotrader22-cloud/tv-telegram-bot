# VECO Developer Handbook — Issue #123 PR 4 Results

**Applies to:** public `/results` conversion redesign.  
**Approved direction:** 2026-09-18 owner conversion brief.  
**Handbook update required:** YES.

## Contract

The Results page is data-first and system-specific. It must not present a synthetic or combined Vixale performance total.

### Day Trading

Use the existing public Day endpoints only:
- `/public-performance.json`;
- `/public-live-open-pnl.json`.

Show current Open Positions, Open P&L, Closed P&L Today, Total Realized P&L, and the existing realized-equity point series. Open P&L remains separate from realized P&L. No new polling loop or calculation owner is introduced.

### Swing Trading

Use the existing public `/api/swing-leaders` endpoint. Show only already-published model fields such as Active Portfolio count, Potential Candidates count, latest total model P&L, up to a small number of active rows, and published snapshot date.

Always label Swing as research/model portfolio evidence and not brokerage-account performance.

### Options

Options has no separate public trade/results API. Do not invent sample values. The public Results page states that detailed owner-entered journal rows, closed-only realized equity, and available owner-provided brokerage screenshots remain behind existing viewer access.

## Separation rule

Day Trading, Swing Trading, and Options evidence are not added together, normalized into one account result, or compared as if they shared a single execution/accounting source.

## Preload ownership

`website_conversion_results_refinement.js` is the first preload for `/results`, ahead of the Issue #123 system/home/navigation presentation layers. It handles GET/HEAD public HTML only.

## Safety boundary

PR 4 must not modify `app.js`, trading strategy behavior, Pine, broker/execution paths, Sheet schemas/calculations, Swing Trading Lab output, Option Journal calculation, or viewer auth.

## Validation

Before merge:
- Node syntax-check the new Results layer;
- run focused Results regression;
- verify the three existing public source paths are reused;
- verify there is no `setInterval`/polling addition;
- verify no combined Vixale total appears;
- verify Options contains no fabricated financial values;
- verify branch is 0 behind fresh `main` and diff is scoped.

After merge, verify exact Render SHA, successful build/startup, port 10000, and LIVE status.
