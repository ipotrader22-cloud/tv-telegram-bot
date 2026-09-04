# Vixale Swing Leaders v1.1 — Public Feed Naming Addendum

**Approved by Trading Lab / owner:** 2026-09-04  
**Scope:** Google Sheets `Public Feed` ingestion naming only  
**Trading behavior:** unchanged

## Canonical Trading Lab feed names

Trading Lab intentionally renamed the candidate metadata/section in the live `Public Feed`:

- metadata: `candidate_count`
- section: `POTENTIAL CANDIDATES`

These names are now canonical for the Trading Lab worksheet.

## Engineering compatibility rule

The website ingestion layer must accept both the new canonical names and the prior aliases during transition:

- `candidate_count` (canonical) or `intern_count` (legacy alias)
- `POTENTIAL CANDIDATES` (canonical) or `INTERNS` (legacy alias)

If both count aliases are present with different values, ingestion fails closed. If both section aliases are present simultaneously, ingestion fails closed rather than guessing which section is authoritative.

For backward compatibility, the existing Engineering snapshot/API shape remains unchanged in this patch (`intern_count` / `interns`). Public website labels remain **Potential Candidates**. This avoids an unrelated API break while allowing the Trading Lab worksheet to use its new canonical naming.

## Incident / root cause

On 2026-09-04 the live Trading Lab sheet switched to `candidate_count` / `POTENTIAL CANDIDATES` while the deployed parser still required `intern_count` / `INTERNS`. The strict parser therefore rejected the complete feed as `Public Feed sections are incomplete`, and a newly restarted process had no prior valid cache to serve.

## Boundaries

This compatibility change does not alter scoring, candidate selection, Active Portfolio membership, target/stop behavior, exit logic, model P&L methodology, GOOGLEFINANCE, Pine, TradingView alerts, UAM, bridge logic, TWS/IBKR execution, or broker lifecycle behavior.
