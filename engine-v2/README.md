# VIXALE Engine 2.0 — shadow foundation

Status: isolated, read-only prototype. **Do not merge or activate as a production portfolio writer yet.**

This folder contains a pure deterministic decision kernel and tests, independently of ChatGPT scheduled tasks. It has no broker connection, outbound network, credentials, scheduling, Google Sheets mutations, or Render deployment configuration.

## Test
`node --test engine-v2/core.test.cjs`

## Source-of-Truth invariants
- Nine weighted factors totaling 100; scores below 70 are not eligible Active holdings.
- Verified 09:30 regular-session opening at or below original entry * 0.95 is a stop trigger. Exit is a later verified contemporaneous quote, never the opening trigger price.
- Intraday +10% target uses evidence during the open lot's lifetime; model close at entry * 1.10.
- Score dropout only after verified reassessment, with contemporaneous quote.
- Fixed $10,000 model P&L per position and $100,000 starting equity.
- Closed-trade Q=NO equivalent exclusion for public calculations, with unique lot reconciliation.
- An incomplete review fails validation, even if the publication snapshot date is current.

## Required before a safe production migration
1. Implement authenticated primary cloud market-data feeds and independently verified, timestamped quote evidence; optional read-only IBKR demo gateway is not a required dependency.
2. Implement full daily nine-factor research-evidence collection and score audit.
3. Implement durable PostgreSQL positions, immutable events, source-data provenance, transaction locks/revisions, idempotent jobs and notification outbox.
4. Implement NYSE-session-aware scheduling and strict state transitions for DATA -> PUBLICATION -> DELIVERY.
5. Introduce a shadow-only importer of the live workbook, preserving Q/R, formula-driven cash/Closed Trades/Equity History, immutable historical D marks, and non-destructive read-only comparison.
6. Build publication adapters for the existing Google Sheet and website without disturbing existing production until tested.
7. Replay historical model events, test outages and idempotency, run shadow comparisons, and only then perform a separately approved cutover.

No actual brokerage trades are ever authorized. IBKR demo mode does not change this. Do not backdate model quotes or fabricate research.
