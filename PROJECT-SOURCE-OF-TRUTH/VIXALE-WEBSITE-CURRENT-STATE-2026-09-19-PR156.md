# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-19 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

Latest directly verified website-changing state:

- **Latest website-changing merge:** PR #156 — `Fix homepage Day chart readability middleware order`
- **PR #156 merge SHA:** `8ea045b2c06c788eca02475190555d9da2d1033d`
- **Observed PR #156 state:** MERGED
- **Pre-merge verification:** GitHub Actions run `35476843592` — SUCCESS on the tested code for syntax, focused middleware-order regression, Express integration from an unconverted homepage, existing homepage/runtime regressions, Issue #123 homepage/final-QA regressions, chart inline-script regression, and `git diff --check`.
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deploy for PR #156:** `dep-danht2ss728c73at8uc0`
- **Render deployed website-changing SHA:** `8ea045b2c06c788eca02475190555d9da2d1033d`
- **Render deployment status:** LIVE
- **Render verification:** exact PR #156 merge SHA was checked out; build succeeded; `npm start` showed `website_home_preview_chart_readability_fix.js` loading before `website_conversion_home_refinement.js`; the server reported `Server running on port 10000`; Render reported `Your service is live` at 2026-09-19T23:46:07Z.
- **Fresh independent public-origin post-refresh visual verification:** UNVERIFIED in the current tool environment. A cache-busting direct public URL could not be accessed by the available web fetch. Do not infer pixel-perfect browser behavior from deployment status alone.

## PR #156 — homepage Day preview readability middleware order

PR #156 corrects the production middleware/preload ordering discovered after PR #154. The readability normalizer itself remains the same; the change ensures it is actually injected into the final homepage response:

- `website_home_preview_chart_readability_fix.js` is now a direct Node preload before `website_conversion_home_refinement.js`;
- on the response path, homepage conversion creates `#vx-conversion-day-chart` first, then the readability transform sees the converted HTML and injects its style/runtime assets;
- `website_home_equity_empty_fix.js` no longer owns readability registration;
- the existing Day preview still mirrors the same chart/data and keeps the existing refresh cadence;
- no new P&L endpoint, calculation, interpolation, polling loop, or alternate feed is introduced.

The runtime compatibility layer continues to normalize SVG text size, stroke widths, and point-marker radii for the narrower homepage preview and handles later mirrored-chart replacement after the delayed performance refresh.

## Prior website-changing states since the previous recorded manifest

The repository `MASTER-INDEX.md` had remained pointed at the PR #149 manifest while later website changes were merged and deployed. Directly verified later states include:

- PR #151 — dedicated Day Trading chart presentation aligned with Results; merge SHA `7262de4c92cf3d72138b772e34ebd0605a2f2eaf`; Render deploy `dep-damt4gff3r2c73dhfbbg` reached LIVE.
- PR #154 — first homepage Day preview readability compatibility layer; merge SHA `4bc3a07e1713c79c3fbf57d5982956a519318729`; Render deploy `dep-danhnuqjnfac738tlgug` reached LIVE. Subsequent browser feedback showed no visible effect, and PR #156 identified the middleware-order root cause.

The PR #149 manifest remains the prior checked-in historical manifest and its contracts continue except where later changes explicitly supersede chart presentation/runtime behavior.

## Data and safety boundary

PR #156 does **not** change Trading Lab output, Day Closed Trades calculations, Swing calculations, Google Sheets schema or writes, quote sources, Telegram, Pine, signal timing, entries/exits/targets/stops, authentication, bridge, TWS, IBKR, or risk behavior. It is a website runtime/presentation ordering fix only.
