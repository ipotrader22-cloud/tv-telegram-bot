# VECO Developer Handbook — Results Charts and Description-Card Standard

Date: 2026-09-18
Scope: public website presentation only

## Purpose

This addendum records the owner-approved presentation contract for public performance charts and reusable description cards.

It does **not** change Trading Lab logic, strategy behavior, signal generation, entries/exits, target/stop logic, Google Sheets calculations, public performance arithmetic, authentication, Telegram, bridge, TWS, or IBKR execution.

## Results chart contract

`/results` must keep Day Trading and Swing Trading evidence separate and use only their already-authoritative public data sources.

### Day Trading

- source remains `/public-performance.json`;
- the chart continues to use existing `equity_curve.points[].cumulative_pnl` values;
- no alternate realized-P&L calculation is introduced;
- the chart includes visible Y-axis money labels, horizontal reference lines, a visible zero baseline when it falls inside the plotted range, first/last date labels, and a `Realized P&L` legend.

### Swing Trading

- source remains `/api/swing-leaders`;
- the Results page mirrors the same `equity_history` used by the public Swing Trading page;
- the chart uses existing `equity_history[].total_model_pnl` values and does not recalculate model P&L;
- the chart includes visible Y-axis money labels, horizontal reference lines, a visible zero baseline when applicable, first/last snapshot-date labels, and a `Model P&L` legend;
- the visible compact candidate label is `Candidates`; the underlying feed field remains unchanged.

Day and Swing charts must never be combined into one performance total or transformed into brokerage-account performance.

## Reusable description-card visual standard

`website_description_card_standard.js` is the shared public-site presentation layer for explanatory/description cards.

The standard appearance is:

- rounded card surface;
- light green to white gradient: `#eaf8f0 -> #f6fbf8 -> #ffffff`;
- subtle green border `#d7e8df`;
- 24px desktop radius and 21px mobile radius;
- restrained soft green shadow;
- compact inner padding for paragraph-style description cards.

The standard is applied to established public description surfaces such as:

- homepage hero supporting copy;
- public system-page hero descriptions;
- Results intro description;
- Swing hero description;
- Swing `How Swing Leaders Works` explanations;
- homepage system-description cards;
- system proof/description cards;
- public explanatory boundary/disclosure cards where the light treatment is compatible.

Dark live-data panels, metric cells, charts, tables, protected dark-state panels, and trading-status surfaces are **not** converted to this light description-card treatment.

Future public explanatory cards should prefer the reusable `.vx-description-card` class instead of inventing a different light-card treatment.

## Implementation boundary

The shared description-card module injects CSS only into successful HTML responses. It does not alter routes, text, data values, API responses, calculation code, or authentication behavior.

The Results chart renderer is presentation-only JavaScript. It reads the already-returned Day and Swing series and draws SVG axes/labels/lines. It does not create, interpolate, backfill, or modify historical points.

## Verification

Regression coverage should confirm:

- both Day and Swing chart containers exist on `/results`;
- Day rendering references `cumulative_pnl`;
- Swing rendering references `total_model_pnl` and `snapshot_date`;
- both charts include Y-axis labels and legends;
- injected inline JavaScript remains syntactically valid after HTML composition;
- shared description-card CSS is present and idempotent;
- package preload order keeps the final-QA layer first and loads the shared description-card standard immediately after it;
- existing Swing, Results/final-QA, and public performance regressions remain passing.

## Rollback

Rollback is presentation-only: revert the Results chart/description-card PR. No Trading Lab, Sheet, broker, Telegram, authentication, or execution rollback is required.
