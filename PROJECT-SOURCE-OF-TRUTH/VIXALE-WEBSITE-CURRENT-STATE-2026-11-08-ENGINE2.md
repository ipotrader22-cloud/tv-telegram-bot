# VIXALE Website — Current State, November 8, 2026

Swing Trading at https://www.vixale.com/trading-systems/swing-trading now uses Engine 2. Owner explicitly authorized production activation. This supersedes earlier inactive/staging-only rollout notes for the website source.

- Code: merged PR #379, `402931e73904e6e2b39de342212dc04a1fc88afa`. Current main homepage-video changes are retained.
- Final Render deploy: `dep-dbo8frpsrm7s73b8ip20`, Live November 8 14:32:54 UTC / 09:32:54 EST. Source variable: `VIXALE_SWING_SOURCE=ENGINE2`.
- Production account reads Engine 2 Public Feed and Equity History with reader-only permission; actual runtime reads verified. Historical staging names remain; the financial workbook is now the selected production website source.
- Final authenticated EN/RU page/API checks pass, identical fingerprint `f393d84333f56905a8e27974`, no-store, anonymous 302/401. External health 200. Connected production browser rendering and screenshot verified.
- Displayed last-session snapshot: November 6 10:00 ET; zero active positions, five candidates, closed CVX/XOM; realized/total model P&L -1011.37. This is model performance, not broker performance.
- Actual deployed LEGACY rollback passed on both domains: `dep-dbo8esbm8hqs73frjds0`, Live 14:31:22 UTC, fingerprint `9a5ba0cea451ada958611ec6`; October 16 legacy snapshot. ENGINE2 was restored and independently rechecked afterward.
- Release CI passed (42428393357, 42428392054, 42428393299). Combined-main full-startup owner/viewer EN/RU tests passed in both modes; homepage-video regression and syntax passed.
- No trading logic, model ledger, Q/R, formulas, broker orders, emails, customer codes or scheduler changes. Existing Engine 2 writer cron is unsuspended.

Rollback source: set `VIXALE_SWING_SOURCE=LEGACY`, normal deploy, verify actual date and page/API parity. The old source is dated October 16. If code rollback is needed, pre-release baseline `1668433afb08379b9ba5664bf5d7acbcb56e7f2d` / `dep-dbn6j8lckfvc73ft04a0` preserves the homepage video. No data rewrite is required.

Full evidence: `docs/releases/ENGINE2_SWING_ROLLOUT.md`. Handbook updated. Monday's future market cycle remains unverified; no background monitoring is implied. Prior homepage-video playback limitations remain as recorded in `VIXALE-WEBSITE-CURRENT-STATE-2026-11-06-PR380.md`. Repository documentation is persisted in Git; separate documentation export/upload not performed.
