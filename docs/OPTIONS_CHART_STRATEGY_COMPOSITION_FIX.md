# Options public chart — strategy composition fix

## Root cause

The public Options evidence refinement correctly injected a compact `vx-options-public-preview-stack` containing the realized-P&L chart and the dashboard example. Later in the response-transform chain, `website_strategy_page_design_refinement.js` consolidated the Options hero/preview/results sections into the unified story, but it extracted only the nested `vx-options-dashboard-shot`. That discarded the injected chart while leaving the public Option Journal, which sits outside the replaced preview section.

## Fix

`consolidateOptionsStory()` now preserves the full `vx-options-public-preview-stack` when it exists and falls back to the historical dashboard/empty preview when it does not. This keeps the chart above the dashboard example without changing Options data, calculations, authentication, brokerage-proof protection, trading logic, or execution behavior.

A focused regression test composes the public-evidence refinement with the strategy-page refinement and asserts that the chart, dashboard example, public journal, ordering, preview anchor, and protected-proof boundary all survive.
