# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-19 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #158 — `Keep homepage Day preview stable after delayed refresh`
- **PR #158 merge SHA:** `fd662e781084faeef903573d7644900a59b46566`
- **Observed PR #158 state:** MERGED
- **Focused pre-merge verification:** GitHub Actions run `35480610414` — SUCCESS on tested head `b9551cc2353242d1cdb89fc3547cda8788659772`; the final PR head `6aac8acdc372b47998afc64b9c9b629af5573ac0` differed only by removal of the temporary verification workflow.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #158:** `dep-danjpch7lnhs73e9c090`
- **Render deployed website-changing SHA:** `fd662e781084faeef903573d7644900a59b46566`
- **Render deployment status:** LIVE
- **Render verification:** Render checked out the exact PR #158 merge SHA; build completed successfully; `npm start` loaded `website_home_preview_chart_readability_fix.js` before `website_conversion_home_refinement.js`; the server reported `Server running on port 10000`; Render reported `Your service is live` at `2026-09-20T01:54:32Z` (2026-09-19 America/New_York).
- **Fresh independent public post-refresh browser verification after PR #158:** UNVERIFIED in the current tool environment. User-side browser verification is still required for the two-second visual-stability behavior.

The checked-in `MASTER-INDEX.md` had remained pointed at PR #149 even though PR #151, PR #154, PR #156, and now PR #158 had been merged and directly verified through GitHub/Render. This manifest supersedes that stale pointer once merged.

## PR #158 — homepage Day preview visual stability

PR #158 is public website presentation-only. It extends the homepage Day Trading preview compatibility layer so a delayed lower-chart re-render with the same realized-history identity does not replace the already-normalized first-paint preview with a differently laid-out SVG clone.

The preview identity is derived only for presentation comparison from:

- displayed Total Realized P&L;
- point count;
- first displayed date;
- last displayed date.

When that identity is unchanged, the existing normalized preview markup is preserved. When the identity changes, the new chart is accepted and normalized so genuinely updated realized history can still appear.

No extra performance fetch or polling loop was added.

## Prior fixes still in force

- PR #156 corrected the preload / middleware ordering so the homepage readability transform actually applies after homepage conversion has created `#vx-conversion-day-chart`.
- PR #154 added viewport-aware normalization for text, stroke widths, point markers, and dense histories.
- PR #151 aligned the dedicated Day Trading chart presentation with the Results chart standard.
- PR #149 added Results chart axis/legend improvements, the Swing equity chart on Results, and the shared public description-card visual standard.

## Data and safety boundary

PR #158 does **not** change:

- `/public-performance.json`;
- `equity_curve.points[].cumulative_pnl` values;
- Open P&L sources;
- Closed Trades calculations;
- Trading Lab output;
- Google Sheets reads/writes or schemas;
- Telegram;
- Pine;
- signal timing;
- entries, exits, targets, stops, or risk;
- authentication;
- bridge, TWS, or IBKR behavior.

It is a website presentation-only change.

## Conflict handling

Until this documentation update is merged, repository operational state and Render directly verify PR #158 as the deployed website-changing code, while the checked-in `MASTER-INDEX.md` remains stale at PR #149. Treat that documentation mismatch as **CONFLICT / UNVERIFIED** for any claim based only on the old pointer; use live GitHub/Render verification for operational state.
