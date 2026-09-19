# VECO Developer Handbook Addendum — Homepage Preview Chart Clone Readability

Date: 2026-09-19
Scope: public website presentation only

## Problem

The homepage Day Trading product preview mirrors the existing lower-home realized-P&L chart rather than creating a second P&L data source.

The lower chart is rendered server-side with a fixed SVG `viewBox`, then `website_home_performance_refinement.js` refreshes it about 2.5 seconds after load and redraws it responsively using the lower chart container's wider runtime dimensions.

`website_conversion_home_refinement.js` mirrors that SVG into the narrower top product-preview chart. Copying the wider refreshed SVG without compensating for the different viewport causes SVG text, line widths, and point markers to shrink visually. The result is a chart that looks readable on first paint and then becomes difficult to read after the delayed performance refresh.

## Required presentation rule

The top homepage preview may continue to mirror the existing Day Trading chart DOM, but it must normalize presentation primitives for the preview viewport whenever the mirrored SVG changes.

`website_home_preview_chart_readability_fix.js` owns that compatibility layer. It:

- observes only the homepage `#vx-conversion-day-chart` preview;
- reads the mirrored SVG `viewBox` and the actual preview viewport size;
- compensates `font-size`, `stroke-width`, and circle radius for the SVG scale difference;
- removes intermediate point markers when a dense history contains more than 24 points, while retaining the final marker;
- recalculates the presentation on chart replacement and browser resize;
- does not fetch performance data, calculate P&L, interpolate points, or mutate the authoritative lower chart.

The compensation factor is the larger of the source-to-preview width ratio and source-to-preview height ratio, with a minimum of `1`. This preserves readable visual sizes when a wide lower SVG is displayed inside the narrower preview.

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
- homepage-only and idempotent HTML injection;
- syntactically valid emitted runtime JavaScript;
- MutationObserver-based handling of later chart replacement;
- preload registration immediately after `website_conversion_home_refinement.js`;
- no new polling or duplicate performance-data fetch in the readability layer.

## Rollback

Revert the homepage preview readability module and its preload entry. No data, trading, broker, Sheet, Telegram, or authentication rollback is required.
