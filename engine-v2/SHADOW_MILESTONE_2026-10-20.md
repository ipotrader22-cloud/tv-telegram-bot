# Engine 2.0 isolated milestone — 2026-10-20

PR #329 remains DRAFT, UNMERGED. The clean epoch is 2026-10-19 with $100,000 model equity and no imported legacy lots. No broker orders, live Sheet writes, production website changes, production scheduling changes, or email sends are authorized.

Verified: Render internal Oregon PostgreSQL schema initialized through the guarded initializer in the existing isolated observer. Startup log at 13:02:32 UTC reports 9 tables. Initialization flag was restored to NO and the observer redeployed LIVE. External database IP allowlist remains empty. GitHub Actions for commit 2ccb75d4 succeeded with 229 Node tests (0 failures, 0 skips) plus 3 offline bridge Python tests. These are tests, not verified live market-data/research publication.

Added draft-only: authenticated existing-bridge quote input adapter, dated nine-factor research assembler requiring external evidence, NYSE 10:00 ET calendar gate and DST next-trigger calculator, strict Sheet/API/HTML membership and fingerprint verification, staging-only formula/lease preflight, and a disabled notification intent with idempotent shadow outbox storage.

Blocked: No verified actual real-time LAST prints for the model universe; no complete externally sourced nine-factor daily scores; no native Sheets lease acquisition or staging writer; no staged HTML/API with readback; no Resend send worker. The observer still rejects the historical PLTR import with INVALID_COST_INPUT and reports partial historical certification. Do not present this as a successful autonomous morning run.

Canonical source conflict to resolve before opening model lots: live Automation Config specifies TWO new positions per trading day, whereas a clean-slate branch paragraph says no two-entry cap. Preserve fail-closed behavior; do not silently change the existing workbook rule. Old history remains separate.
