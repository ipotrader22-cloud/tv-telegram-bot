# VECO Developer Handbook — Website Performance Truth Addendum

**Applies to:** public Day Trading performance preview and `/public-performance.json`  
**Added:** 2026-09-08  
**Related routes:** `/`, `/public-performance.json`

## Purpose

This addendum defines the public performance-data semantics introduced by Issue #74 / PR2. It is a website/read-only contract only. It does not change TradingView, strategy logic, Sheets writers, Telegram lifecycle, bridge/TWS/IBKR execution, order handling, risk, Swing automation, or Options owner-entry behavior.

## Public summary contract

Authoritative read sources remain the existing Google Sheets ranges:

```text
Open Positions!A:H
Pending!A:J
Closed Trades!A:I
```

The public summary may expose only approved aggregates. It must not expose symbols, trade IDs, entries, exits, sides, raw payloads, broker order IDs, quote details, or brokerage metadata.

### Pending Setups

The homepage status metric is **Pending Setups** and is exactly the count of non-empty rows in the existing `Pending` worksheet.

The public JSON field is:

```text
summary.pending_count
```

The former public field/label `working_count` / **Working Orders** is removed. The website must not infer broker working orders from target/stop fields stored on Open Position rows.

A future public **Working Orders** metric is permitted only if Engineering introduces an explicitly verified broker/TWS aggregate source and separately reviews the privacy and freshness contract. Raw broker order detail must not be exposed by this public endpoint.

## Realized-equity coverage contract

The Day Trading realized curve continues to use only `Closed Trades`:

```text
Close date: column C
Realized result: column I
```

A row is included in the displayed realized series only when:

- the row contains some data;
- column C parses to a supported close date;
- column I is non-blank and parses to a finite numeric realized P&L.

The equity payload now publishes presentation-only coverage metadata:

```text
equity_curve.coverage.first_close_date
equity_curve.coverage.last_close_date
equity_curve.coverage.included_trade_count
equity_curve.coverage.omitted_row_count
```

`included_trade_count` counts eligible rows, not chart dates. Multiple trades closing on the same date remain multiple included trades while contributing to one daily chart point.

`omitted_row_count` counts non-empty Closed Trades rows omitted from the realized curve because their close date or realized result is missing/invalid. Blank trailing worksheet space is not counted.

The coverage line must also state that **Open P&L is excluded**. This metadata is methodology context for the displayed series; it is not account-performance certification.

No commission/fee inclusion claim is introduced by this contract. A fee claim requires a separate trace of the authoritative Closed Trades result-writing path.

## Freshness contract

`updated_at` is the timestamp of the successful source snapshot used to build the public payload.

Cache behavior remains:

- successful cached data within the normal cache window may be returned as current;
- when a source refresh fails and an older cached payload exists, the endpoint returns that payload with `stale: true` and preserves the original `updated_at` timestamp;
- when no usable snapshot exists, the endpoint returns HTTP 503 with `performance_unavailable`;
- no simulated replacement values are permitted.

Public presentation states are data-freshness states only:

```text
fresh successful payload -> Data current
stale cached payload      -> Update delayed
first client fetch failure -> Update delayed
repeated fetch failures    -> Data unavailable
```

These states must not be described as proof that the stock market is open, that a strategy is actively trading, or that a broker connection is healthy.

The Day Trading block displays the most recent successful `updated_at` as **Last updated**. A stale cached response keeps its original timestamp. A fetch failure never fabricates a new update time.

## Homepage presentation implementation

`website_performance_truth_refinement.js` is a presentation-only final HTML pass for the homepage. It is intentionally the first `-r` preload in `package.json` so its Express response wrapper is installed first and therefore receives the final outbound HTML after later refinement wrappers unwind.

It is responsible only for the PR2 presentation contract:

- customer-facing `Pending Setups` label;
- client binding from `summary.pending_count`;
- `Data current / Update delayed / Data unavailable` badge semantics;
- `Last updated` display;
- realized-equity coverage line;
- repeated-fetch failure downgrade.

The existing performance renderer continues to draw the equity curve and current status values. This addendum does not authorize general-purpose page rewriting or unrelated navigation/layout changes. Staged reduction of the broader preload/refinement chain remains a separate Engineering task in Issue #74.

## Validation

Before merge:

- `node --check website_public_performance.js`;
- `node --check website_performance_truth_refinement.js`;
- `node --check tests/test_public_performance.js`;
- `node --check tests/test_performance_truth_refinement.js`;
- `node tests/test_public_performance.js`;
- `node tests/test_performance_truth_refinement.js`;
- existing homepage performance/live-open-P&L regressions must still pass;
- verify the endpoint contains `pending_count` and does not contain `working_count`;
- verify coverage counts/date range from representative Closed Trades fixtures;
- verify stale cached data preserves its original `updated_at`;
- verify first/repeated client failures downgrade the freshness badge without replacing displayed values with simulated data;
- verify non-home routes are unchanged;
- verify trading, Sheets writers, Swing automation, Option Journal writers, Telegram, bridge, TWS, and IBKR code are absent from the diff.

After an approved deployment, verify the exact Render commit reaches LIVE and visually confirm desktop/mobile Day Trading status, Last updated, Pending Setups, coverage context, and stale/unavailable presentation.

## ADR-WEB-003 — Public performance exposes ledger intent, not inferred broker orders

**Decision:** The public Day Trading preview exposes `Pending Setups` directly from the existing Pending worksheet and removes the inferred `Working Orders` metric. Public freshness is represented explicitly with source-snapshot time and degraded states. Realized equity publishes coverage metadata from the same Closed Trades rows used to construct the curve.

**Reason:** A Pending setup and target/stop fields are not authoritative evidence of a live broker working order. Likewise, retaining old values after a failed refresh must not continue to imply a live/current data state. Coverage metadata prevents the realized series from silently implying that omitted rows were included.

**Data/schema impact:** Public JSON response fields change, but Google Sheets schemas and all writers remain unchanged. No broker/TWS source is added. No simulated value or new environment variable is introduced.

**Execution impact:** None.

## Rollback

Revert the PR2 merge. No Google Sheets, viewer access, Swing workbook, Option Journal, trading-state, broker-state, Telegram, TWS, or IBKR rollback is required.
