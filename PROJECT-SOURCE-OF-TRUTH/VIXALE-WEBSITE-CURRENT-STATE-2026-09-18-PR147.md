# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #147 — `Rename Swing Market Posture to Market Update with release stamp`
- **PR #147 merge SHA:** `76f7a6924f67b65c9496a7ef42a574e34d0ae1d3`
- **Observed PR #147 state:** MERGED
- **Focused pre-merge verification:** GitHub Actions run `35403437123` — SUCCESS for syntax, focused Swing presentation regression, existing Swing regressions, final-QA guard, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #147:** `dep-dams27n40ujc73bn3qmg`
- **Render deployed website-changing SHA:** `76f7a6924f67b65c9496a7ef42a574e34d0ae1d3`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #147 merge SHA was deployed by the `tv-telegram-bot` service and Render reported LIVE at `2026-09-18T22:54:56.398984Z`.
- **Fresh public-origin content verification after PR #147:** PENDING in this documentation branch until the cache-busting production check completes.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #147 as the latest website-changing code reference.

## PR #147 — Swing Market Update release stamp

PR #147 changes only the public Swing Trading presentation layer:

- the former public `Market Posture` block is labeled **`Market Update`**;
- the Trading Lab market-commentary text remains the existing `market_posture` feed value and is not generated or rewritten by Engineering;
- Market Update commentary uses the same body sizing as the beginner Active Portfolio description: **18px desktop / 17px mobile**;
- the compact Market Update heading remains 16.5px desktop / 15px mobile;
- every rendered Market Update includes a `Released:` line using the existing Trading Lab Public Feed `snapshot_date` and `snapshot_time_et` values;
- the release stamp is snapshot/research release time, not browser load time, server time, or fetch time;
- the primary presentation source is the existing hero Snapshot pill, with the existing Last Updated footer as a fallback; both originate from the same validated Public Feed snapshot fields.

## Prior website-changing state

The immediately preceding website presentation state is recorded in:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18-PR145.md`

Its contracts remain in force except where PR #147 explicitly supersedes Market Posture naming and Market Update typography/release metadata.

## Safety boundary

PR #147 does **not** change Trading Lab scoring/selection, market commentary generation, Active Portfolio membership, candidate data, Closed Trades, Equity History, P&L calculations, Google Sheets schema/writes, quote sources, Telegram, Pine, signal timing, entries/exits/targets/stops, authentication, bridge, TWS, or IBKR behavior. It is a website presentation-only change.
