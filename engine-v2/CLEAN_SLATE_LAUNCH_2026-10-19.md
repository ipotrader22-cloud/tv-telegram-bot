# New portfolio epoch — October 19, 2026

New ledger starts 2026-10-19 with $100,000 model equity, zero open lots and zero closed lots. Archive the prior portfolio and its audit evidence separately; do not inherit historical positions, P&L, or redefined entry prices.

Nine factor caps: market 10, sector 15, leadership 15, catalyst 10, base 15, compression 10, volume 15, moving averages 5, resistance 5. Eligibility minimum 70. Max ten positions, normalized $10,000 model allocation each. Verified 09:30 regular-session -5% opening stop; verified contemporaneous quote to close. Proven lifetime +10% target; verified score-dropout below 70. No real broker orders.

A reliable morning workflow requires NYSE-calendar scheduler, timestamped primary market data, full nine-factor research evidence, idempotent position-state transactions, website and Google Sheet publication adapters, and confirmation of delivery. Blank quotes and incomplete research must block updates, preserve last approved state and surface errors. Duplicate retries must not create duplicate trades or posts. Do not falsely label yesterday's positions reviewed today.

Implemented: isolated pure decision kernel, read-only valuation/history guards, clean-slate epoch initializer and tests. NOT YET IMPLEMENTED: primary quote provider, complete automated research collector, stateful morning runner, safe website and Google Sheet publication adapters. Do not claim that tomorrow's posting is enabled.

Never merge PR #329 or change production until shadow end-to-end tests and separate explicit go-live approval.

## Engineering implementation added October 18

- `research-attestation.cjs`: validates every symbol in a declared universe (including candidates), nine factor score caps/evidence, at least 200 completed dated OHLCV bars, MA20/50/200, true exchange volume, benchmarks, and underlying source IDs. Empty universe is not a successful review.
- `market-data-adapter.cjs`: inject-only provider contract. Rejects premarket, stale, negative/zero prices, future quotes, missing source IDs, unverified volume, or non-regular-session trades. It **does not** create or purchase a market-data connection.
- `first-day-selector.cjs`: selects at most ten candidates with verified score 70+ and fresh regular-session model-entry prices. Starting holdings remain empty if no candidates are verified, and legacy entries are prohibited. No brokerage orders.
- `clean-ledger.cjs`: restricted shadow database transaction with PostgreSQL advisory lock, unique date/run constraint, event IDs, and an explicitly disabled publication outbox. Not a substitute for the separate Google Sheets lease/fence protocol required after future cutover.
- `clean-morning-runner.cjs`: composes provider session, research, quotes, position selection and shadow commit; returns blocked results without writes when evidence is missing. It has no scheduled invocation yet.
- `publication-contract.cjs`: verifies model/notes, formula and HTML/API parity requirements before downstream delivery. Does not write production sheets or send mail.

**Integration boundary:** These modules live on the draft shadow branch. Primary quote-provider credentials/adapter implementation, actual reliable daily research production, persistent scheduled execution and website/Sheet publishing have NOT been enabled. The existing production legacy portfolio and task schedules remain untouched. Never state the October 19 public launch is operational until a complete validated test and separately authorized cutover.

Current Source-of-Truth protections carry forward: normalized fixed-$10k accounting, nine factor score caps, opening-only -5% stop, +10% lifetime target, verified <70 dropout, protected Q/R and spreadsheet formulas, developer-metadata lease/fence on any future scheduled Sheet writer, independent website HTML/API parity and Resend idempotency.
