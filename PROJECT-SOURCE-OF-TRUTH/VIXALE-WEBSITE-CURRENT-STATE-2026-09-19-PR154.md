# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-19 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #154 — `Keep homepage Day chart readable after refresh`
- **PR #154 merge SHA:** `4bc3a07e1713c79c3fbf57d5982956a519318729`
- **Observed PR #154 state:** MERGED
- **PR #154 final branch head:** `6355b7495f5058980b62b7efc6e38a0c51604dd8`
- **Focused pre-merge verification:** GitHub Actions run `35475879962` — SUCCESS for syntax, focused homepage chart-readability regression, existing homepage performance/runtime regressions, Issue #123 homepage/final-QA regressions, emitted chart-script regression, unchanged `package.json`, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #154:** `dep-danhnuqjnfac738tlgug`
- **Render deployed website-changing SHA:** `4bc3a07e1713c79c3fbf57d5982956a519318729`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #154 merge SHA was checked out; build completed successfully; `npm start` ran; the server reported `Server running on port 10000`; Render reported `Your service is live` at approximately `2026-09-19T23:35:04Z`.
- **Fresh independent public-origin visual verification after PR #154:** UNVERIFIED. The public fetch available to this session returned a page snapshot crawled before the deploy and cannot verify the post-refresh SVG behavior. Do not infer pixel-perfect runtime rendering from the Render deployment alone.

## PR #154 — Homepage Day chart post-refresh readability

PR #154 fixes the homepage Day Trading product-preview chart becoming difficult to read after the delayed performance refresh.

The existing lower-home Day Trading equity chart remains the authoritative DOM/data source. After the lower chart redraws responsively, the top preview continues to mirror that SVG, but a homepage-only presentation compatibility layer now compensates SVG text size, stroke width, and marker radius for the narrower preview viewport. Dense intermediate point markers are suppressed when the mirrored history contains more than 24 points while the final marker remains visible.

The fix is composed through the existing `website_home_equity_empty_fix.js` preload; no new top-level `package.json` preload is introduced.

## Data and safety boundary

PR #154 does **not** change:

- `/public-performance.json`;
- `equity_curve.points[].cumulative_pnl` values;
- Open P&L sources;
- Closed Trades calculations;
- Google Sheets reads or writes;
- Trading Lab output;
- Telegram;
- Pine;
- signal timing;
- entries, exits, targets, stops, or risk;
- authentication;
- bridge, TWS, or IBKR behavior.

It is a public website presentation/runtime compatibility change only.

## Immediately preceding website-changing state

PR #151 — `Align dedicated Day Trading chart with Results chart` — was merged as `7262de4c92cf3d72138b772e34ebd0605a2f2eaf` and deployed by Render as `dep-damt4gff3r2c73dhfbbg` before PR #154.

A documentation-only PR created after PR #151 remained unmerged and therefore never became authoritative production state. This PR154 manifest supersedes that pending documentation record once merged.

## Rollback

Revert PR #154. No data, trading, broker, Sheet, Telegram, authentication, or execution rollback is required.
