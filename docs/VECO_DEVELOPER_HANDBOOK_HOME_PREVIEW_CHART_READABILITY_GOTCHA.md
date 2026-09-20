# VECO Developer Handbook Addendum — Homepage Preview Chart Clone Readability

Date: 2026-09-19
Scope: public website presentation only

## Problem

The homepage Day Trading product preview mirrors the existing lower-home realized-P&L chart rather than creating a second P&L data source.

The lower chart is rendered server-side with a fixed SVG `viewBox`, then `website_home_performance_refinement.js` refreshes it about 2.5 seconds after load and redraws it responsively using the lower chart container's wider runtime dimensions.

`website_conversion_home_refinement.js` mirrors that SVG into the narrower top product-preview chart. Copying the wider refreshed SVG without compensating for the different viewport causes SVG text, line widths, and point markers to shrink visually. The first production compatibility fix corrected scaling and preload order, but a second presentation discontinuity remained: when the lower chart re-rendered the same realized history with different SVG layout geometry, the preview still replaced its already-normalized first-paint chart with that newly laid-out clone.

## Required presentation rule

The top homepage preview may continue to mirror the existing Day Trading chart DOM, but it must normalize presentation primitives for the preview viewport and must not replace a stable preview merely because the lower chart re-rendered the same realized history with different SVG geometry.

`website_home_preview_chart_readability_fix.js` owns that compatibility layer. It:

- observes only the homepage `#vx-conversion-day-chart` preview;
- reads the mirrored SVG `viewBox` and the actual preview viewport size;
- compensates `font-size`, `stroke-width`, and circle radius for the SVG scale difference;
- removes intermediate point markers when a dense history contains more than 24 points, while retaining the final marker;
- records the normalized preview markup after first paint;
- derives a lightweight realized-data identity from the existing `Total Realized P&L`, `Closed Trades Today`, and `Closed P&L Today` text already rendered by the authoritative homepage performance layer;
- when the lower chart causes a replacement with the same realized-data identity, restores the already-normalized preview instead of accepting a layout-only visual change;
- accepts and normalizes a replacement when that realized-data identity changes, so genuinely updated closed-trade state can still appear;
- recalculates presentation on browser resize;
- does not fetch performance data, calculate P&L, interpolate points, or mutate the authoritative lower chart.

The compensation factor is the larger of the source-to-preview width ratio and source-to-preview height ratio, with a minimum of `1`. This preserves readable visual sizes when a wide lower SVG is displayed inside the narrower preview.

The realized-data identity is intentionally presentation-adjacent rather than a new data contract. It exists only to distinguish an equivalent lower-chart layout redraw from a meaningful closed-trade update. SVG marker count, displayed date labels, path geometry, and `viewBox` are specifically excluded because the responsive renderer may change those presentation details without any data change. The identity does not replace `/public-performance.json`, and it must never be used for P&L calculation, reconciliation, or trading decisions.

## Middleware / preload ordering gotcha

The readability transform must be registered as a top-level Node preload **before** `website_conversion_home_refinement.js` in `package.json`.

Reason: these website modules wrap `express()` and then wrap `res.send()`. With the readability module loaded before the homepage conversion module, request middleware is installed in that same order, so on the response path the conversion wrapper runs first and creates `#vx-conversion-day-chart`; the readability wrapper then receives that converted HTML and can inject its style/runtime script.

Do **not** register readability only through a later preload such as `website_home_equity_empty_fix.js`. That ordering makes the readability `res.send()` wrapper execute before homepage conversion has created the preview target, so its route guard sees no `#vx-conversion-day-chart` and silently leaves the response unchanged. This was the root cause of the first production fix having no visible effect despite the normalization code itself being valid.

Canonical preload relationship:

```text
... -r ./website_home_preview_chart_readability_fix.js
    -r ./website_conversion_home_refinement.js ...
```

`website_home_equity_empty_fix.js` remains independent and must not own readability registration.

## Data and execution boundary

This fix is presentation-only. It does not change:

- `/public-performance.json`;
- `equity_curve.points[].cumulative_pnl` values;
- Open P&L sources;
- Closed Trades calculations;
- Google Sheets reads or writes;
- Trading Lab output;
- Telegram;
- Pine;
- signal timing;
- entries, exits, targets, stops, or risk;
- bridge, TWS, or IBKR behavior.

## Regression rule

Keep focused coverage for:

- the preview-scale calculation;
- realized-data identity construction and equality behavior;
- explicit exclusion of SVG marker/date/layout output from the refresh identity;
- homepage-only and idempotent HTML injection;
- syntactically valid emitted runtime JavaScript;
- MutationObserver-based handling of later chart replacement;
- preserving normalized preview markup across an equivalent layout-only source redraw;
- allowing a replacement when authoritative realized-data text changes;
- direct top-level preload registration before `website_conversion_home_refinement.js`;
- an Express integration test proving that a source homepage without `#vx-conversion-day-chart` is first converted and then receives the readability assets;
- no new polling or duplicate performance-data fetch in the readability layer.

## Rollback

Revert the homepage preview readability compatibility layer or the latest stability change. No data, trading, broker, Sheet, Telegram, or authentication rollback is required.
