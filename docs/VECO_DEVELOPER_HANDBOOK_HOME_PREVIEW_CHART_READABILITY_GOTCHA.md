# VECO Developer Handbook Addendum — Homepage Day Preview Chart

Date: 2026-09-20
Scope: public website presentation only

## Canonical rule

The homepage top **Day Trading** tab and the lower **Day Trading performance — Equity Curve — Realized P&L** card use the same authoritative public performance feed:

```text
Closed Trades worksheet
→ website_public_performance.js
→ GET /public-performance.json
→ equity_curve.points[].cumulative_pnl
```

The top Day Trading tab must read that feed directly. It must **not** clone, observe, resize, or otherwise depend on the lower `#vx-home-equity-svg` DOM.

This rule supersedes the earlier DOM-clone compatibility approach from PR #154 / #156 / #158 / #160. Those fixes addressed scale and delayed redraw symptoms, but production screenshots showed that keeping the top chart coupled to the lower chart's SVG lifecycle still allowed a visible second layout after load.

## Ownership boundary

`website_home_day_preview_feed_refinement.js` owns the final visible chart target in the top Day Trading tab.

On the final homepage response it changes the conversion layer's legacy target:

```text
vx-conversion-day-chart
```

to the direct-feed target:

```text
vx-conversion-day-feed-chart
```

and injects the direct-feed renderer. Older compatibility scripts still looking for `vx-conversion-day-chart` therefore no-op instead of replacing the visible chart.

The direct-feed renderer:

- fetches `/public-performance.json` with `cache: no-store`;
- reads only the existing `equity_curve.points` array;
- plots each point's existing `cumulative_pnl` value in date order supplied by the endpoint;
- preserves the endpoint's stale/last-valid behavior rather than inventing replacement values;
- shows unavailable state only when no valid chart has been rendered;
- may refresh on initial load, return to the Day tab, or document visibility recovery;
- does not add interval polling;
- does not read the lower chart SVG or install a lower-chart `MutationObserver`.

The lower Day Trading performance card keeps its existing rendering and refresh lifecycle. A lower-chart responsive redraw must have no effect on the top Day Trading tab chart.

## Middleware / preload ordering

The production preload relationship is:

```text
... -r ./website_home_preview_chart_readability_fix.js
    -r ./website_home_day_preview_feed_refinement.js
    -r ./website_conversion_home_refinement.js ...
```

Because the Express response wrappers unwind in reverse order, `website_conversion_home_refinement.js` first creates the legacy chart target, then `website_home_day_preview_feed_refinement.js` retargets it to the direct-feed chart before the outer compatibility layer sees the response.

Do not move the direct-feed refinement after `website_conversion_home_refinement.js` in the preload list without re-verifying response-wrapper order.

## Data and execution boundary

This is presentation-only. It does not change:

- `/public-performance.json` calculations or schema;
- `equity_curve.points[].cumulative_pnl` values;
- Closed Trades calculations;
- Open P&L sources;
- Google Sheets reads or writes;
- Trading Lab output;
- Telegram;
- Pine;
- strategy entries, exits, targets, stops, sizing, or signal timing;
- bridge, TWS, or IBKR behavior.

The website must never calculate a second realized-P&L series for this preview or substitute mock/simulated chart values.

## Regression rule

Keep focused coverage proving that:

- the final homepage contains `#vx-conversion-day-feed-chart`;
- the final homepage does not contain the legacy `#vx-conversion-day-chart` target;
- the direct renderer fetches `/public-performance.json` and consumes `equity_curve.points[].cumulative_pnl`;
- it does not clone `#vx-home-equity-svg` or observe lower-chart DOM redraws;
- emitted runtime JavaScript parses successfully;
- homepage transformation is route-scoped and idempotent;
- preload order causes homepage conversion to run before direct-feed retargeting on the response path;
- existing Day Trading performance, homepage, and inline-script regressions continue to pass;
- no trading, broker, Sheet schema, or execution code is changed.

## Rollback

Revert the direct-feed refinement and its preload registration. No data, trading, broker, Sheet, Telegram, authentication, or execution rollback is required.
