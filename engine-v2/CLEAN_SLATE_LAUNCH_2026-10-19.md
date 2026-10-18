# New portfolio epoch — October 19, 2026

New ledger starts 2026-10-19 with $100,000 model equity, zero open lots and zero closed lots. Archive the prior portfolio and its audit evidence separately; do not inherit historical positions, P&L, or redefined entry prices.

Nine factor caps: market 10, sector 15, leadership 15, catalyst 10, base 15, compression 10, volume 15, moving averages 5, resistance 5. Eligibility minimum 70. Max ten positions, normalized $10,000 model allocation each. Verified 09:30 regular-session -5% opening stop; verified contemporaneous quote to close. Proven lifetime +10% target; verified score-dropout below 70. No real broker orders.

A reliable morning workflow requires NYSE-calendar scheduler, timestamped primary market data, full nine-factor research evidence, idempotent position-state transactions, website and Google Sheet publication adapters, and confirmation of delivery. Blank quotes and incomplete research must block updates, preserve last approved state and surface errors. Duplicate retries must not create duplicate trades or posts. Do not falsely label yesterday's positions reviewed today.

Implemented: isolated pure decision kernel, read-only valuation/history guards, clean-slate epoch initializer and tests. NOT YET IMPLEMENTED: primary quote provider, complete automated research collector, stateful morning runner, safe website and Google Sheet publication adapters. Do not claim that tomorrow's posting is enabled.

Never merge PR #329 or change production until shadow end-to-end tests and separate explicit go-live approval.
