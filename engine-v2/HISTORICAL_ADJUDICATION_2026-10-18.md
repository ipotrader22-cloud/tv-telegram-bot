# Historical entry and valuation reconciliation — evidence-based findings (2026-10-18)

**Production unchanged. Shadow PR #329 must remain draft/unmerged.** This is a recovery audit, not a claim of independent execution or market-price verification.

## Entry-record discrepancies: exact-lot comparison

The key is original ticker + entry date. Earlier canonical **Open Positions** worksheet revisions were recovered as text/plain seven-section workbook exports from the same Google Sheet. All early entries below agree with the 2026-10-07 revision 241; nine continuing trades then changed in revision 248 (2026-10-08 14:04:12 UTC).

| Lot | Earliest inspected corroborating revision | Original entry price | Oct 8 entry price | Original shares | Oct 8 shares | Result |
|---|---|---:|---:|---:|---:|---|
| AMD / Sep 21 | 150 (Sep 21, 14:02:29 UTC) | 607.84 | 607.05 | 16 | 16 | ENTRY_REWRITTEN |
| MU / Sep 23 | 159 (Sep 23, 14:02:54 UTC) | 1073.80 | 1090.27 | 9 | 9 | ENTRY_REWRITTEN |
| GLW / Sep 29 | 194 (Sep 29, 18:47:20 UTC) | 159.22 | 158.79 | 63 | 63 | ENTRY_REWRITTEN |
| NVDA / Sep 28 | 194 (Sep 29, 18:47:20 UTC) | 229.07 | 231.95 | 43 | 43 | ENTRY_REWRITTEN |
| DELL / Sep 29 | 194 (Sep 29, 18:47:20 UTC) | 543.43 | 548.20 | 18 | 18 | ENTRY_REWRITTEN |
| LITE / Oct 5 | 226 (Oct 6, 14:03:31 UTC) | 1091.67 | 1086.18 | 9 | 9 | ENTRY_REWRITTEN |
| TSM / Oct 5 | 226 (Oct 6, 14:03:31 UTC) | 485.80 | 478.02 | 20 | 20 | ENTRY_REWRITTEN |
| MRVL / Oct 7 | 241 (Oct 7, 14:02:06 UTC) | 290.76 | 283.73 | 34 | 35 | ENTRY_AND_SHARES_REWRITTEN |
| TER / Oct 7 | 241 (Oct 7, 14:02:06 UTC) | 439.45 | 411.75 | 22 | 24 | ENTRY_AND_SHARES_REWRITTEN |

The record mutation is documented and confirmed at the revision level. **Intent and legitimacy of correction are not established.** These positions are not demonstrably invalid trades; wholesale deletion would destroy evidence and corrupt realized performance. Keep originals as the authoritative *earliest observed records*, not certified broker fills, pending entry execution/timestamp proof.

## Valuation reconstruction

| Frozen date | Earlier historical revision | Earlier recorded unrealized | Earlier recorded equity | Later revision 278 unrealized | Later revision 278 equity | Valuation |
|---|---|---:|---:|---:|---:|---|
| Oct 7, 10:00 ET | 241 (Oct 7, 10:02:06 ET) | -100000 | 7330.419192 | -731.9077381868364 | 106598.5115 | RETROSPECTIVE_REPAIR_UNVERIFIED |
| Oct 8, 10:04 ET | 248 (Oct 8, 10:04:12 ET) | -100000 | 6800.096238 | -1324.0554015996718 | 105476.0408 | RETROSPECTIVE_REPAIR_UNVERIFIED |

Both earlier versions show **ten active positions with blank live prices and blank market values**, open market value zero, and total unrealized exactly -100000. Root cause of the reported catastrophic loss is absent valuation inputs treated as zero; NOT attributable to an individual erroneous trade. The later corrected marks are recorded retrospectively in revision 278; the recovered revision DOES NOT provide independent timestamped source quotes for those historical cutoffs. Formula consistency is not price verification. The missing source quote data means neither corrected historical market value is **certified**.

## Timestamp evidence versus gaps

- Revision 241 modified 2026-10-07T14:02:06.410Z = 10:02:06 ET (EDT); its Oct 7 equity mark says 10:00 ET. Workbook revision is AFTER the claimed cutoff and does not establish all underlying mark-price timestamps.
- Revision 248 modified 2026-10-08T14:04:12.934Z = 10:04:12 ET (EDT); Oct 8 equity mark says 10:04 ET. PLTR October 8 entry note separately cites a Stocktwits quote 2026-10-08T10:04:08-04:00, after the start of the labeled 10:04 minute. A minute-precision label is insufficient to decide before/after entry definitively.
- Revision 159 modified Sep 23 10:02:54 ET, **before** its frozen Sept 23 time labeled 10:11 ET; this inconsistency remains unresolved.
- Revision metadata timestamps a workbook edit, not every quote nor every execution. Without independent timestamped quotes/trade events, do not assert exact intraday membership or frozen mark certification.

## Completed safeguard (shadow-only)

- `valuation-integrity.cjs`: absent, zero, negative, or invalid price causes BLOCKED with null computed valuation.
- `shadow-compare.cjs`, `live-sheet-check.cjs`, `shadow-health.cjs`: guards integrated; read-only observer deployed on Render commit `827118bcd68cb3b39f926f457ce3c7f762b63f5a`. GitHub workflow 39128942461 SUCCESS. **Task: COMPLETE.**
- Observer detected invalid/missing old imported cost fields for PLTR; historical imported snapshot remains noncertified. Preventing new invalid calculations is complete, reconstructing original missing quote inputs is not.

## Conservative adjudication

1. Nine discrepancies RESOLVED as documented entry-record **mutations**, not proven invalid trades; original cost basis established as earliest recovered *record values*. No trade exclusions certified.
2. Oct 7–8 extraordinary loss RESOLVED as missing-quote **valuation calculation defect**. Later repaired marks exist but remain **UNCERTIFIED** without original market-price provenance.
3. Historical timecut membership, entry fill timestamps, and corrected mark prices **NOT PROVEN**. Stay PARTIAL / BLOCKED as appropriate. Do not invent timestamped quotes or replace historical equity automatically.
4. No production writes, no trade deletions, no merge or main deployment. Keep draft PR #329 isolated.
