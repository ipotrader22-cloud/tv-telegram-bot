# Engine 2.0 parity and integration gate (October 16, 2026)

All work is **SHADOW-ONLY**. The canonical Google Sheet and website have not been modified.

## Full-precision accounting finding

Read-only audit of the live workbook at its latest 2026-10-16 snapshot:
- 26 closed trades, 21 publicly included (Q=YES), 5 excluded (Q=NO).
- No duplicate ticker|entryDate keys in closed records.
- SUM of all eligible native effective Closed Trades L return values * 10000 = -163.8458812217616.
- Native Equity History C31 effective value = -163.84588122176135.
- Difference approximately 2.6e-13 USD, floating-point noise.
- Frozen Equity History D31 is -313.8387964531242 at 10:08 ET.
- Native Equity History F31 99522.31532232511.
- A replay from two-decimal display prices alone was ~1.15 USD different; preserving full-precision return L resolves this discrepancy.

Never recompute historical realized model P&L from formatted Exit Price alone. Q=NO rows remain in duplicate detection. R effective date gates inclusion. Equity History D is frozen historical observation, not a later model mark.

## Real database integration

CI now includes ephemeral postgres:16 and runs `node --test engine-v2/*.test.cjs` with an isolated testing URL. The integration test DROPS the vixale_v2 schema, so NEVER run it against a permanent DB, even a persistent non-production DB. It must ONLY be run against an explicitly disposable database.

CI result must be checked in GitHub; writing the workflow is not proof that it executed or passed.

## Production prerequisites

No paid database provisioned and no production migration approved. Independent scheduler, live vendor credentials and actual full daily research pipeline have not been implemented. Source-of-Truth trading rules and formula-driven Google Sheet sections remain under the current production automation ownership.
