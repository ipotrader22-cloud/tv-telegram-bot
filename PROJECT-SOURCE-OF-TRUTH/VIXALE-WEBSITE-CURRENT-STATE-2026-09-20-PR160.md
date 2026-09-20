# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-20 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #160 — `Use data-only identity for homepage Day preview refresh`
- **PR #160 merge SHA:** `57c4fcd3d8fa20fd49a8f3a275e059ed1d2f9611`
- **Observed PR #160 state:** MERGED
- **Pre-merge verification:** GitHub Actions run `35488941946` — SUCCESS for syntax, focused preview data-signature regression, emitted runtime-script parsing, middleware-order integration, homepage performance/runtime regressions, Issue #123 homepage/final-QA regressions, chart inline-script regression, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #160:** `dep-danm1jbtqb8s73alr59g`
- **Render deployed website-changing SHA:** `57c4fcd3d8fa20fd49a8f3a275e059ed1d2f9611`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #160 merge SHA was checked out; build succeeded; `npm start` loaded the homepage preview readability preload before `website_conversion_home_refinement.js`; the server reported `Server running on port 10000`; deploy status reached `live` at `2026-09-20T04:29:49Z`.
- **Fresh independent post-PR160 browser verification:** UNVERIFIED in the current tool environment. The owner had reproduced the delayed visual switch before PR #160, but no post-PR160 screenshot/confirmation has yet been recorded in this manifest. Do not infer pixel-perfect browser behavior from Render deployment state alone.

This manifest supersedes the stale checked-in PR #149 Current-State pointer once this documentation change is merged.

## PR #160 — Homepage Day preview delayed-refresh stability

PR #160 is a public website presentation-only correction for the homepage Day Trading preview chart.

The existing architecture remains:

```text
/public-performance.json
→ website_home_performance_refinement.js authoritative lower Day equity chart
→ website_conversion_home_refinement.js mirrors that SVG into the top homepage Day preview
→ website_home_preview_chart_readability_fix.js normalizes the mirrored preview presentation
```

The remaining production issue after PR #158 was that the preview-refresh identity still included renderer-derived SVG details such as point/marker count and displayed date labels. The lower chart's responsive redraw can change those presentation details even when realized trading data is unchanged, so the preview incorrectly accepted a second visual layout about 2.5 seconds after first paint.

PR #160 changes the preview-refresh identity to use only already-rendered realized-data metrics from the authoritative homepage layer:

- Total Realized P&L (`vx-home-equity-total`)
- Closed Trades Today count (`vx-home-live-2`)
- Closed P&L Today (`vx-home-live-3`)

SVG marker count, displayed date labels, `viewBox`, path geometry, and other layout-derived values are excluded from the identity. A geometry-only redraw should therefore preserve the normalized first-paint preview, while a genuine realized-data change can still replace and normalize the preview.

No extra performance fetch, polling loop, alternate feed, P&L calculation, interpolation, or trading rule was added.

## Intervening website-changing states since PR #149

The checked-in Source-of-Truth pointer remained at PR #149 while several website fixes were directly verified and deployed. Their operational records are retained here so the gap is explicit:

### PR #151 — Dedicated Day Trading chart presentation

- Merge SHA: `7262de4c92cf3d72138b772e34ebd0605a2f2eaf`
- Render deploy: `dep-damt4gff3r2c73dhfbbg`
- Result: dedicated `/trading-systems/day-trading` chart aligned with the Results chart standard: visible Y-axis money labels, horizontal guides, zero baseline, dates, markers, and `Realized P&L` legend.
- Data source and P&L calculations unchanged.

### PR #154 — Homepage preview chart readability scaling

- Merge SHA: `4bc3a07e1713c79c3fbf57d5982956a519318729`
- Render deploy: `dep-danhnuqjnfac738tlgug`
- Result: added the homepage preview readability compatibility layer to compensate SVG text/stroke/marker scale differences between the lower chart and narrower preview.
- Later production evidence showed the middleware was not yet injected in the effective response order; PR #156 corrected that.

### PR #156 — Homepage readability middleware/preload order

- Merge SHA: `8ea045b2c06c788eca02475190555d9da2d1033d`
- Render deploy: `dep-danht2ss728c73at8uc0`
- Result: registered `website_home_preview_chart_readability_fix.js` before `website_conversion_home_refinement.js` so the response transform runs after the homepage conversion has created `#vx-conversion-day-chart`.

### PR #158 — Preserve preview across delayed lower-chart redraw

- Merge SHA: `fd662e781084faeef903573d7644900a59b46566`
- Render deploy: `dep-danjpch7lnhs73e9c090`
- Result: attempted to retain normalized first-paint preview markup across equivalent lower-chart redraws.
- Subsequent production screenshots showed the identity still depended on SVG renderer output; PR #160 supersedes that identity logic.

## No-op repository/deploy commits before PR #160

Two temporary repository commits occurred after PR #158 while diagnosing connector access: an accidental `__probe__` file was created and immediately removed. Direct GitHub compare showed the cleanup state had **zero changed files** versus the prior application tree. Render auto-deployed those commits, but they did not constitute a website-changing application state. PR #160 was then merged on top of the cleanup commit.

## Data and safety boundary

PR #160 and the intervening chart fixes described above do **not** change:

- `/public-performance.json` calculations or schema;
- `equity_curve.points[].cumulative_pnl` values;
- Day Trading Closed Trades calculations;
- Swing Trading Lab scoring, selection, portfolio membership, or model P&L calculations;
- Google Sheets schema, reads, or writes;
- quote sources;
- Telegram;
- Pine / strategy behavior;
- signal timing;
- entries, exits, targets, stops, sizing, or risk;
- authentication;
- local bridge;
- TWS / IBKR execution behavior.

These changes are website presentation/runtime compatibility changes only.

## Prior website-changing state

The previously checked-in Current-State manifest is:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18-PR149.md`

Its contracts remain in force except where PR #151, PR #154, PR #156, PR #158, and PR #160 explicitly supersede Day chart presentation and homepage preview refresh behavior.

## Source-of-Truth maintenance note

Older unmerged documentation PRs for PR #156 and PR #158 are superseded by this PR #160 manifest and should remain closed/unmerged. The canonical pointer should reference only this manifest once merged.
