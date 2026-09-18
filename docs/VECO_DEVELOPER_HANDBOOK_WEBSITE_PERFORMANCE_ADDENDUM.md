# VECO Developer Handbook — Website Performance Truth Addendum

**Applies to:** public Day Trading performance preview and `/public-performance.json`  
**Added:** 2026-09-08  
**Updated:** 2026-09-18 — Issue #107 PR 6 evidence credibility extension  
**Related routes:** `/`, `/pricing`, `/public-performance.json`, `/trading-systems/swing-trading`, `/trading-systems/options`

## Purpose

This addendum defines the public performance/evidence presentation semantics introduced by Issue #74 and extended by Issue #107 PR 6. It is a website/read-only contract only. It does not change TradingView, strategy logic, Sheets writers, Telegram lifecycle, bridge/TWS/IBKR execution, order handling, risk, Swing automation, or Options owner-entry behavior.

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

The equity payload publishes presentation-only coverage metadata:

```text
equity_curve.coverage.first_close_date
equity_curve.coverage.last_close_date
equity_curve.coverage.included_trade_count
equity_curve.coverage.omitted_row_count
```

`included_trade_count` counts eligible rows, not chart dates. Multiple trades closing on the same date remain multiple included trades while contributing to one daily chart point.

`omitted_row_count` counts non-empty Closed Trades rows omitted from the realized curve because their close date or realized result is missing/invalid. Blank trailing worksheet space is not counted.

The coverage line must also state that **Open P&L is excluded**. This metadata is methodology context for the displayed series; it is not account-performance certification.

The Day Trading website uses the stored Closed Trades realized P&L as its authoritative result value. The public presentation does not apply another commission/fee adjustment and therefore must not imply that the website independently recalculates commission-inclusive performance.

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

`website_performance_truth_refinement.js` remains the Day Trading freshness/coverage owner. Issue #107 PR 6 adds `website_evidence_credibility_refinement.js` as a final outbound presentation pass. It is intentionally the first `-r` preload in `package.json` so its Express response wrapper is installed first and therefore receives the final outbound HTML after later refinement wrappers unwind.

The PR 6 refinement may clarify customer-facing evidence source, coverage, fee-treatment, and freshness wording, but it must not recalculate trading results or replace the underlying page/data owners.

## Cross-system evidence credibility contract — Issue #107 PR 6

The public site must keep the three evidence types separate instead of collapsing them into a generic **verified performance** claim:

- **Day Trading:** Closed Trades ledger / execution-backed lifecycle evidence where applicable. The public realized curve uses stored Closed Trades P&L, excludes open P&L, exposes the source coverage range, included row count, and materially omitted source-row count, and does not add a separate website fee/commission adjustment.
- **Swing Trading:** Trading Lab research/model portfolio. Public presentation must say it is not broker execution or brokerage-account performance. Coverage can be derived only from the displayed public model data: Equity History snapshot range/count and displayed Closed Trades exit-date range/count. Active positions are model unrealized P&L; closed positions are model realized P&L. The website does not add a separate commission/fee adjustment to the Trading Lab model return/history series.
- **Options:** owner-entered Option Journal. The public page explains the evidence source and access boundary rather than publishing protected rows. The protected realized curve includes Closed journal records with valid exit dates/derived P&L and excludes open journal records. The existing journal P&L formula subtracts the stored `Fees` value after contracts and multiplier; the website must not invent any additional fee estimate.

Freshness and market activity are independent concepts for all three systems. A successful source/page refresh means only that the source responded successfully. It does not prove that a market is open, a strategy is trading, a position is active, or a broker connection is healthy.

Cached/stale behavior must remain explicit:

- Day Trading keeps the original successful `updated_at` and marks cached responses stale; repeated client failure downgrades to unavailable instead of leaving a misleading live state.
- Swing Public Feed and Equity History retain their existing independent stale labels and last-valid-snapshot behavior; missing history is never reconstructed.
- Options is manually owner-entered evidence. Page/viewer availability must not be described as live market activity.
- No evidence surface may replace an unavailable source with simulated profit values.

Issue #107 PR 6 does **not** add maximum drawdown. Drawdown is optional in the product audit and would introduce a new metric/calculation not required to fix the identified terminology/coverage problems. A future drawdown metric must be separately reviewed and, if based only on a displayed realized/model series, labeled as **series drawdown**, never account drawdown.

### Architecture ownership

`website_evidence_credibility_refinement.js` is a presentation-only final-response layer for the current public evidence surfaces. It may read already-rendered public HTML to summarize visible Swing coverage, but it must not query private sources, alter the Swing feed, expose Options journal rows, or calculate replacement P&L. The underlying owners remain:

- `website_public_performance.js` for Day Trading public aggregates/coverage;
- `lib/swing-leaders-core.js` / `lib/swing-leaders.js` for the Swing public model feed and Equity History;
- `website_options_canonical_refinement.js` and the existing Option Journal helpers for protected Options journal/equity behavior.

This additional refinement is not a preload-consolidation refactor. Broader consolidation/deletion of rewrite layers remains owned by the existing technical-debt issue.

## Validation

Before merge:

- syntax-check `website_evidence_credibility_refinement.js` and the focused PR 6 test;
- run the focused PR 6 evidence-credibility regression;
- preserve the existing Day Trading public-performance and freshness regressions;
- preserve the Swing model/stale-data regressions;
- preserve the Options journal/equity regressions;
- verify Day coverage displays first/last date, included count, omitted rows when nonzero, open-vs-realized treatment, and precise fee wording;
- verify Swing evidence is explicitly research/model data with visible snapshot/coverage context and existing stale labels intact;
- verify Options evidence is explicitly owner-entered with accurate open/realized and stored-fee treatment;
- verify successful refresh language is not presented as market/trade activity;
- verify no customer-facing generic `Verified performance` wording remains on the targeted evidence surfaces;
- verify no simulated fallback values are introduced;
- verify `app.js`, Pine, bridge/TWS/IBKR, trading logic, Sheets writers/schemas, and authentication are absent from the PR diff.

After an approved deployment, verify the exact Render commit reaches LIVE and visually confirm the evidence terminology/coverage blocks on the affected public routes.

## ADR-WEB-003 — Public performance exposes ledger intent, not inferred broker orders

**Decision:** The public Day Trading preview exposes `Pending Setups` directly from the existing Pending worksheet and removes the inferred `Working Orders` metric. Public freshness is represented explicitly with source-snapshot time and degraded states. Realized equity publishes coverage metadata from the same Closed Trades rows used to construct the curve.

**Reason:** A Pending setup and target/stop fields are not authoritative evidence of a live broker working order. Likewise, retaining old values after a failed refresh must not continue to imply a live/current data state. Coverage metadata prevents the realized series from silently implying that omitted rows were included.

**Data/schema impact:** Public JSON response fields change, but Google Sheets schemas and all writers remain unchanged. No broker/TWS source is added. No simulated value or new environment variable is introduced.

**Execution impact:** None.

## ADR-WEB-004 — Evidence type, coverage, and freshness are explicit across systems

**Decision:** Public evidence presentation identifies Day Trading ledger evidence, Swing Trading research/model evidence, and Options owner-entered journal evidence separately. Coverage/sample context is shown from already-authorized public/displayed data. Freshness labels describe source freshness only, not market or trading activity. Generic `Verified performance` wording is replaced with source-specific language where PR 6 touches the page.

**Reason:** A source can refresh successfully without any market activity, and the three systems do not share the same evidentiary provenance. Source-specific labels and coverage prevent a visitor from reading a displayed series as broker/account certification.

**Data/schema impact:** None. Existing Day public JSON coverage is consumed for presentation. Swing coverage is summarized from the already-rendered public model data. Options public copy describes the existing protected journal contract. No private row is exposed and no new metric source is created.

**Execution impact:** None. No trading, strategy, Pine, bridge, TWS/IBKR, writer, auth, or broker behavior changes.

## Rollback

Revert the Issue #107 PR 6 evidence-credibility commit(s) and restore the prior `package.json` preload command. No Google Sheets, viewer access, Swing workbook, Option Journal, trading-state, broker-state, Telegram, TWS, or IBKR rollback is required.
