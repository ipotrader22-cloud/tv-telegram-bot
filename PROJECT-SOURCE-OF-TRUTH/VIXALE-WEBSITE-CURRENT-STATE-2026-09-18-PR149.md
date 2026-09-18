# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-18 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #149 — `Improve Results charts and standardize public description cards`
- **PR #149 merge SHA:** `e9169215bbfcf374846be573897b7d06efc7ce0d`
- **Observed PR #149 state:** MERGED
- **Focused pre-merge verification:** GitHub Actions run `35406766868` — SUCCESS for syntax, focused Results chart regression, shared description-card regression, emitted inline-script regression, Swing UI/Leaders/instructional regressions, Issue #123 final-QA guard, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #149:** `dep-damsqhu8bjmc73a27r9g`
- **Render deployed website-changing SHA:** `e9169215bbfcf374846be573897b7d06efc7ce0d`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #149 merge SHA was checked out and deployed by the `tv-telegram-bot` service; build succeeded, `npm start` loaded `website_description_card_standard.js`, the server reported `Server running on port 10000`, and Render reported `Your service is live` at `2026-09-18T23:47:02Z`.
- **Fresh independent public-origin visual verification after PR #149:** UNVERIFIED in the current tool environment; the direct web fetch available to this session could not access the public URL. Do not infer pixel-perfect rendering from deployment state alone.

A later documentation-only commit/deploy may advance `main` without changing website runtime behavior. Such a docs-only deploy does not replace PR #149 as the latest website-changing code reference.

## PR #149 — Results charts and public description-card standard

PR #149 changes only public website presentation and chart rendering:

- `/results` Day Trading chart keeps the existing `/public-performance.json` source and existing `equity_curve.points[].cumulative_pnl` values, while adding visible Y-axis money labels, horizontal guides, a zero baseline when in range, first/last date labels, point markers for compact histories, and a `Realized P&L` legend;
- `/results` Swing block adds a model-equity chart from the existing `/api/swing-leaders` `equity_history[].total_model_pnl` data already used by the Swing Trading page; no new model-P&L calculation or alternate feed is introduced;
- Day and Swing evidence remain separate and are not combined into one performance total;
- the visible Swing compact label is `Candidates` while the existing feed field remains unchanged;
- the public Swing hero description and the four `How Swing Leaders Works` explanations use rounded light-green-to-white gradient cards;
- `website_description_card_standard.js` establishes the same restrained pale-green/white gradient treatment for compatible public description/explanatory cards across the site, without restyling dark live-data panels, metric cells, tables, or charts.

## Data and safety boundary

PR #149 does **not** change Trading Lab scoring/selection, market commentary generation, portfolio membership, Day Closed Trades calculations, Swing Equity History calculations, Google Sheets schema/writes, quote sources, Telegram, Pine, signal timing, entries/exits/targets/stops, authentication, bridge, TWS, or IBKR behavior. It is a website presentation-only change.

## Prior website-changing state

The immediately preceding website presentation state is recorded in:

`PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-09-18-PR147.md`

Its contracts remain in force except where PR #149 explicitly supersedes Results chart presentation and the public description-card visual standard.
