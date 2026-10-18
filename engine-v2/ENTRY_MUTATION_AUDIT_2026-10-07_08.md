# October 7–8 historical entry-field mutation audit

Source: read-only Google Drive canonical workbook revisions 241 (October 7, 2026, 14:02:06 UTC) and 248 (October 8, 2026, 14:04:12 UTC). Matched by exact ticker and original entry date in Open Positions. This is a discrepancy report, **not** a trade-invalidity certification.

| Lot | Oct 7 price | Oct 8 price | Oct 7 shares | Oct 8 shares |
|---|---:|---:|---:|---:|
| AMD / Sep 21 | 607.84 | 607.05 | 16 | 16 |
| MU / Sep 23 | 1073.80 | 1090.27 | 9 | 9 |
| GLW / Sep 29 | 159.22 | 158.79 | 63 | 63 |
| NVDA / Sep 28 | 229.07 | 231.95 | 43 | 43 |
| DELL / Sep 29 | 543.43 | 548.20 | 18 | 18 |
| LITE / Oct 5 | 1091.67 | 1086.18 | 9 | 9 |
| TSM / Oct 5 | 485.80 | 478.02 | 20 | 20 |
| MRVL / Oct 7 | 290.76 | 283.73 | 34 | 35 |
| TER / Oct 7 | 439.45 | 411.75 | 22 | 24 |

Nine continuing positions have changed recorded entry prices; two also have changed share quantities. Not enough evidence to distinguish corrections, adjustments, or unauthorized historical rewrites. No trade deletion justified yet.

**Separate valuation defect:** Both dates' source snapshots contain 10 active positions with blank live prices and blank market values. Spreadsheet reported 0 open market value / -100000 unrealized P&L; that is missing quote data treated as zero value, not proof of a $100000 market loss. Later revision 278 carries corrected nonzero Oct 7 and Oct 8 marks (unrealized -731.9077381868364 and -1324.0554015996718 respectively).

**New isolated safeguard:** `valuation-integrity.cjs` returns BLOCKED and null monetary totals on missing/nonpositive/nonfinite quotes. `auditImmutableEntries` flags same-lot entry price, share or cost-basis mutations, without modifying originals. Regression tests added. This guard is not yet wired into production or deployed shadow calculation.

Keep historical parity PARTIAL; preserve originals. Reconcile change author/time and documented trade amendments before any specific lot exclusion.
