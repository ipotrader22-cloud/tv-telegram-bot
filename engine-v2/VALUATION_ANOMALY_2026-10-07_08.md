# Valuation anomaly: October 7–8, 2026

Read-only historical workbook comparison. Revision 241 (Oct 7) and revision 248 (Oct 8) show 10 Active Portfolio positions each, but all displayed live quotes and market values are empty. Both report open market value 0 and unrealized P&L -100000. The anomalous frozen equities are 7330.419192 (Oct 7) and 6800.096238 (Oct 8).

Revision 278 (Oct 16) retains historical frozen entries for those dates with nonzero valuations: Oct 7 unrealized -731.9077381868364, total 6598.511454, equity 106598.5115; Oct 8 unrealized -1324.0554015996718, total 5476.040837, equity 105476.0408.

Diagnosis: missing quote/market-value inputs caused the model's entire $100000 allocated active book to be valued at zero. This is a valuation-input failure, not evidence of a trade-level loss. Also investigate whether entry price/cost changes across revisions represent unintended mutations of immutable lots. Do not exclude any trade based solely on this portfolio-wide anomaly. Archive the original marks and keep frozen membership certification PARTIAL pending cutoff and lot verification. No production changes.
