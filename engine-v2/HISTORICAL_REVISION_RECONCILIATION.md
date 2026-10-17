# Historical workbook revision reconciliation — 2026-10-17

**Result: NOT CERTIFIED.** Preserve shadow historical membership status PARTIAL. No changes to production or the canonical workbook.

## Sources inspected
- Google Drive revision metadata for spreadsheet `14D-D2YDiH_nwk-vMExVBZSzH18QRxgiyRv-XPlS-qFc` (Morning Leader Portfolio — Automated).
- Read-only CSV exports of revisions 150 (2026-09-21 14:02:29 UTC), 155 (2026-09-22 14:00:28 UTC), 159 (2026-09-23 14:02:54 UTC), 241 (2026-10-07 14:02:06 UTC), 276 (2026-10-15 14:03:28 UTC), 278 (2026-10-16 14:08:16 UTC).
- Engine 2.0 canonical parser `live-sheet-check.cjs` and historical auditor `snapshot-audit.cjs`.

## Critical source mismatch
The historical revision CSV exports examined start with `Morning Leader Portfolio — Live P&L Tracker`, a display/tracker worksheet. Engine 2.0's canonical source instead reads `'Closed Trades'!A4:R1000`, `'Equity History'!A2:G1000`, and `'Open Positions'!A4:R100`. CSV exports of the tracker alone **cannot establish** the canonical frozen equity mark, mark cutoff, or exact Open Positions membership. The revision's modifiedTime timestamps a file revision, not necessarily the trade or equity valuation cutoff.

## Recovered tracker snapshots (NOT canonical certifications)
- Revision 150, 2026-09-21: CIEN, AMD (2 displayed active rows).
- Revision 155, 2026-09-22: ANET, TVTX, CIEN, AMD, LITE, BE (6).
- Revision 159, 2026-09-23: ANET, CIEN, AMD, BE, MU, META (6).
- Revision 241, 2026-10-07: AMD, MU, META, GLW, NVDA, DELL, LITE, TSM, MRVL, TER (10).
- Revision 241 has missing quote/market-value cells and displays a highly negative total; this is not reliable mark-to-market evidence.
- Revisions 276 and 278 show different active holdings, but are tracker exports and cannot independently certify canonical historical membership.

## Remaining blockers
1. Retrieve revision-level data for the canonical `Open Positions` and `Equity History` tabs, if supported, with exact timestamp and time zone.
2. Prove the frozen mark's valuation cutoff, separately from Drive revision modification time.
3. Reconcile each lot's entry/exit event timestamp to that cutoff; a tracker row labelled Active Portfolio is not execution evidence.
4. Google revision retrieval returned HTTP 429 rate limits during broader inspection; do not brute-force or assume unavailable revisions are empty.

**Decision:** 0 of the 18 previously unverified historical dates newly certified by this investigation. Keep all 18 unresolved and preserve existing PASS for realized P&L, zero formula errors, and no detected live drift.
