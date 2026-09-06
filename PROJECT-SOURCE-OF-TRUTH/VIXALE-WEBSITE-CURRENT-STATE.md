# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-05 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records repository state, deployment state, and user-visible state separately. Do not infer one from another.

Latest direct verification for the website/dashboard scope:

- **Latest website-changing merge on `main`:** PR #68 — `Separate Options from Day Trading dashboard`
- **PR #68 head SHA:** `8c5880d76c5e662bdef07740dac2c3f255888ed4`
- **PR #68 merge SHA / current verified website code reference:** `8a5e2b414a32fe849b147ecc0847c61997a703e5`
- **Observed PR state:** MERGED
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deployment for PR #68:** `dep-daed8iu7bikc73da04ag`
- **Latest website-changing deployed SHA:** `8a5e2b414a32fe849b147ecc0847c61997a703e5`
- **Deployment status:** LIVE according to Render for that website-changing SHA
- **Authorized UI verification:** USER-VERIFIED after the live deployment on 2026-09-05; user confirmed the separated Day Trading dashboard and dedicated Options page look correct.
- **Independent unauthenticated route verification:** `/dashboard` presents the access-controlled login flow; authenticated page contents require the owner/viewer session and therefore are not independently visible to an unauthenticated browser.

A later documentation-only manifest commit may advance `main` and may itself trigger Render Auto-Deploy without changing website behavior. Such a docs-only deploy does not replace the latest website-changing code reference above. Record a new website-changing SHA only when website/runtime behavior actually changes.

Render `live` status proves the deployment record for the exact PR #68 merge SHA. The user confirmation proves the authorized presentation was observed after that deployment. Do not describe authenticated page contents as independently browser-verified unless a viewer/owner session is available to the checking environment.

## Canonical dashboard split — PR #68

### `/dashboard` — Live Day Trading Dashboard only

Current intended and deployed presentation contract:

- `/dashboard` is the Day Trading dashboard.
- The viewer Option Journal is not shown on `/dashboard`.
- The `Option Journal` link is not shown in the Day Trading dashboard presentation.
- The Option Straddles note is not shown in the Day Trading dashboard presentation.
- Existing Day Trading positions, working orders, closed trades, and the Day Trading realized Equity Curve remain in place.
- Existing dashboard owner/viewer authorization remains authoritative.

This separation is presentation-only and does not alter trading, signal, risk, order, lifecycle, Telegram, bridge, TWS, or IBKR execution logic.

### `/trading-systems/options` — dedicated Options page

Current intended and deployed presentation contract:

- `/trading-systems/options` is the dedicated authenticated Options page.
- It reuses the same owner/viewer access/session as `/dashboard`; there is no second authentication system.
- It shows the existing Option Journal viewer table.
- Existing protected brokerage-proof links remain protected by the existing authorization path.
- `Watch Systems for Free` points to `/#password-access`.
- The manual owner Options workflow remains unchanged.

### Options Equity Curve — Realized P&L

Authoritative data source:

- Worksheet: `Option Journal`
- Read range: `A:S`
- Include only rows where `Status = Closed`.
- Date axis source: valid `Exit Date` (`YYYY-MM-DD`).
- Open rows and invalid/missing rows are excluded.
- No simulated replacement values are permitted.

Existing realized P&L calculation is preserved:

- **Credit:** `(entry price - exit price) × contracts × multiplier - fees`
- **Debit:** `(exit price - entry price) × contracts × multiplier - fees`

Curve calculation:

1. Calculate finite realized P&L for each eligible closed row.
2. Group rows by Exit Date.
3. Sum same-date realized P&L.
4. Sort dates ascending.
5. Calculate cumulative realized Options P&L.

Presentation contract:

- X-axis: Exit Date
- Y-axis: cumulative realized Options P&L ($)
- explicit `$0` baseline
- tooltip: `Date / Daily P&L / Cumulative P&L`
- latest cumulative value: **Total Realized Options P&L**

## Options data-entry and proof workflow

PR #68 does not change the existing manual Options write path.

Still authoritative:

- `/admin/options` create/edit/delete workflow
- existing `Option Journal` schema
- existing `Option Proofs` schema
- existing proof upload/delete behavior
- existing protected proof download/view behavior
- existing `OPTION_PROOFS_DIR`

No new writer, worksheet, schema field, environment variable, trading endpoint, or simulated data fallback was introduced by PR #68.

## Day Trading primary Equity Curve contract

The primary Day Trading performance graph remains **Equity Curve — Realized P&L**.

Authoritative source:

- existing `Closed Trades` worksheet
- **Column C — `close_time`**
- **Column I — `result`**

Calculation:

1. Read the close calendar date from `close_time`.
2. Read realized P&L from `result`.
3. Sum realized P&L values that close on the same calendar date.
4. Sort dates ascending.
5. Calculate cumulative realized P&L.

Presentation:

- X-axis: close date
- Y-axis: Cumulative Realized P&L ($)
- explicit `$0` reference line
- tooltip: `Date / Daily P&L / Cumulative P&L`
- latest cumulative value: **Total Realized P&L**
- no Open/unrealized P&L in the curve
- no simulated replacement values

Repository implementation was originally merged in PR #26 (`f1b38746b17f17bc9ae0ed5f30bc10d65ca107ab`) and is preserved by PR #68.

## Public Trading Systems information architecture

The approved top-level public hierarchy remains:

- **Day Trading** — intraday systems, including Prime, Edge, and Straddles
- **Swing Trading** — one unified multi-session category
- **Market Coverage** — Stocks / Futures / Options detail areas

The dedicated Options viewer page introduced by PR #68 is the authenticated Options destination and must not be folded back into the Day Trading dashboard.

## Other public-page copy and older baselines

The previous manifest contained exact homepage and `/pricing` copy tied to older PRs such as #46 and #48. Multiple later website PRs were merged after those baselines. Therefore:

- older homepage/pricing text in prior manifest revisions must **not** be treated as CURRENT solely because it was once canonical;
- exact current homepage, pricing, About, Swing, guide, navigation, and other public-page copy should be re-verified from live/runtime or the current merged implementation before being quoted as CURRENT;
- this update intentionally does not restate stale older copy as current state.

## Deployment and verification rule

For every future website-facing change:

1. Read `PROJECT-SOURCE-OF-TRUTH/MASTER-INDEX.md`.
2. Read this manifest.
3. Re-check `main` and record the relevant merge SHA.
4. Re-check Render deployment/runtime state.
5. Re-check live user-visible behavior when accessible.
6. If authenticated behavior cannot be independently viewed, distinguish repository/deployment verification from explicit user verification.
7. If evidence conflicts, record **CONFLICT / UNVERIFIED** instead of guessing.
8. Update this manifest after the authoritative state changes.

## Safety boundary

Website/dashboard work must not alter VECO trading logic, strategy rules, signal generation, order logic, risk logic, broker lifecycle behavior, TWS/IBKR execution behavior, or trading algorithms unless explicitly requested by the user.

The Day Trading/Options dashboard separation, both realized-equity charts, viewer authentication reuse, and public presentation changes must remain independent of trading/execution logic.
