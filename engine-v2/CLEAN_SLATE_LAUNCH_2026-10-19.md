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

- `ongoing-cycle.cjs`: pure prospective morning transitions from the clean-slate epoch for verified opening STOP LOSS, intraday TARGET, below-70 DROPOUT, current-price KEEP, and new entries. Records model events, protects unique lots and normalized fixed-$10k accounting. No live writer; opening and target evidence must be source-verified. Separate TARGET monitor still required between daily reviews.

## Entry authorization safeguard (final operational rule)
New model positions require a verified qualifying technical setup and an entry evidence ID, not merely a numeric score. Prefer scores 80+; scores 70–79 additionally require compelling documented entry evidence. Never open below 70 or add just to fill slots. **Up to ten concurrent Active positions, with no arbitrary two-new-positions-per-day cap**, including October 19. New entries are constrained by remaining slots and verified evidence, not a daily entry quota. This is enforced in `first-day-selector.cjs` and `ongoing-cycle.cjs`. Owner correction October 18 supersedes the older two-entry daily recommendation. Provider/research gaps block entry; no synthetic prices or fill-time substitutions.

## Complete operational integration contract — October 18
1. Data: new independently selected candidate universe, dated 200+ completed daily OHLCV, market/sector benchmarks, company-news evidence, and archived provenance. Existing production research collector can supply measurable data; the new daily-research bridge extracts metrics but deliberately does not fabricate scores.
2. Scoring: fresh documented private evidence for all nine weighted factors, a consistent auditable scoring procedure and no incomplete rankings. Accept no guessed company catalysts or bogus exchange volume.
3. Quotes: verified timestamped regular-session actual model entry/exit prints and 09:30 opening/target high evidence. Delayed/historical Yahoo marks cannot substitute for contemporaneous entry quotes. Evaluate whether a licensed provider with secured credential is necessary.
4. Clock: NYSE-aware and New York/DST-correct scheduler invokes the entire new research/decision/DB cycle, with bounded recovery and idempotent run IDs; scheduled existence alone is not proof of success.
5. State: isolated epoch 2026-10-19, 100000 normalized opening equity, at most 10 active holdings, fixed 10000 normalized model P&L per holding, no arbitrary two-entry daily cap; immutable close events, PostgreSQL transaction lock and publication outbox.
6. Publish: stage a new-epoch Sheet/feed and website presentation. Guard all canonical Sheets writes with the already-tested developerMetadata lease/fence in ONE atomic batch. Keep old historical Q/R, protected Public Feed cash/spill and Equity History C/E/F formulas intact. Verify HTML/API snapshot IDs and full membership/date parity with uncached reads.
7. Deliver: Resend date/event idempotent messages only after DATA and PUBLICATION both verified, with send ID and delivery status; retry recovery stage instead of re-executing trades.
8. Release: must pass independently verified provider-backed market-session review plus DB commit, staged Sheet/website readback and email before cutover. CI fixture PASS is necessary but not live launch proof. PR #329 remains draft; no unverified production switch.
