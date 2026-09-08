# VIXALE Website — Current-State Manifest

**Project:** VIXALE — Website / Design / Copy / Public Pages  
**Manifest updated:** 2026-09-08 (America/New_York)  
**Repository:** `ipotrader22-cloud/tv-telegram-bot`  
**Default branch:** `main`

## Verification status

This manifest records repository state, deployment state, and user-visible state separately. Do not infer one from another.

Latest direct verification for the website/dashboard scope:

- **Latest website-changing merge on `main`:** PR #73 — `Add live open P&L to homepage Day Trading status`
- **PR #73 final head SHA:** `45bf5f6084bf168d21456b35e13642da8266bc06`
- **PR #73 merge SHA / latest website-changing repository code reference:** `cb3754517668778ccffd194f4f2ffc4ee17294d7`
- **Observed PR state:** MERGED
- **Render service:** `tv-telegram-bot`
- **Render branch:** `main`
- **Render Auto-Deploy:** enabled / commit-triggered
- **Render deployment for PR #73 merge SHA:** `dep-dafnsbc9v7es73c9vkb0`
- **PR #73 Render deployed SHA:** `cb3754517668778ccffd194f4f2ffc4ee17294d7`
- **PR #73 deployment status:** LIVE, independently verified from Render after successful build/startup.
- **Public homepage visual verification:** UNVERIFIED from independent web crawl at this update. The available crawl still reflected a prior cached snapshot and did not yet expose the fifth card, so it must not be used to contradict the direct GitHub/Render deployment evidence.

A later documentation-only manifest commit may advance `main` and trigger Render Auto-Deploy without changing website behavior. Such a docs-only deploy does not replace the latest website-changing code reference above.

## PR #73 — Homepage Live Open P&L merged and deployed

PR #73 (`Add live open P&L to homepage Day Trading status`) is merged to `main` at `cb3754517668778ccffd194f4f2ffc4ee17294d7` and was independently verified LIVE on Render.

Production presentation/data contract:

- Adds a fifth Day Trading summary card labeled exactly **`Live Open P&L`**.
- Existing four cards remain: Open Positions, Working Orders, Closed Trades Today, Closed P&L Today.
- The homepage Live Open P&L uses the existing TWS-backed open-P&L calculation path already used by the Day Trading dashboard / owner quote flow.
- Open Positions membership refreshes from the existing Google Sheet on a 30-second cache.
- The homepage aggregate polls every 2 seconds while the page is visible.
- The public endpoint returns only `{ ok, open_pnl }`.
- Symbols, positions, entry prices, quotes, bid/ask/last, broker metadata, order data, and owner credentials are not exposed by this endpoint.
- If a complete aggregate cannot be produced, the endpoint fails closed instead of publishing a partial number.
- Desktop uses five matching cards in one row; existing responsive two-column behavior remains on smaller screens.
- Positive/negative color behavior follows the existing P&L card convention.
- No explanatory trading detail was added to the homepage card.

Verification before merge:

- GitHub Actions run `34182496924`: SUCCESS.
- Syntax/package preload check: PASS.
- Homepage Live Open P&L aggregate tests: PASS.
- Homepage performance regression: PASS.
- Existing public dashboard live-P&L regression: PASS.
- Existing public-performance regression: PASS.
- Temporary verification workflow was removed after the successful run.

No Pine, strategy, signal, entry, exit, stop, target, risk, order, bridge, TWS, or IBKR execution behavior is changed by PR #73.

## PR #72 — Dashboard Access Guard merged and deployed

PR #72 (`Harden dashboard access requests with Turnstile and email verification`) is merged to `main` at `b07aa5db54d24bed02c74e45fe15cd588a257876` and was independently verified LIVE on Render.

Production Dashboard Access flow:

```text
Visitor
-> existing honeypot
-> bounded per-IP rate limit
-> normalized-email validation and bounded per-email rate limit
-> Cloudflare Turnstile server verification (`dashboard_access`)
-> write request as `Awaiting Verification`
-> send one-time verification email through existing Resend path
-> applicant confirms email
-> request becomes `Pending`
-> existing owner notification
-> existing manual owner Approve / Reject workflow
```

Security and data contract:

- Turnstile is scoped to the public Dashboard Access request form only.
- `TURNSTILE_SITE_KEY` is browser-visible; `TURNSTILE_SECRET_KEY` remains server-side.
- Missing Turnstile production configuration fails closed for new public requests.
- IP limit: 5 attempts / 15 minutes.
- Normalized-email limit: 3 attempts / 60 minutes.
- `Dashboard Access Requests` extends from A:I to A:L with `Verification Token Hash`, `Verification Expires At`, and `Verified At`.
- New requests begin as `Awaiting Verification`.
- Only a SHA-256 verification-token hash is stored; the raw token is sent only in the email URL.
- Verification links expire after 60 minutes and are single-use.
- Successful email verification changes only request review state to `Pending`; it does not create a viewer code.
- Existing authenticated owner approval remains the sole viewer-code creation path.
- Existing Reject behavior remains non-access-granting.
- Owner-only Delete uses the same access-request admin guard and refuses deletion when the request is linked to a viewer code.
- `/dashboard-login`, existing viewer-code authentication, owner authentication, session cookies, and unrelated dashboard routes remain unchanged.

Environment contract added by PR #72:

```text
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

The owner configured the real Cloudflare Turnstile widget for the Vixale hostnames and saved both variables in Render before PR #72 was merged. Existing `RESEND_API_KEY`, `EMAIL_FROM`, and `SITE_BASE_URL` remain part of the email path.

Acceptance result:

- merge: VERIFIED
- Render deployment of PR #72 merge SHA: VERIFIED LIVE
- production process startup: VERIFIED
- real Turnstile-backed request: USER-VERIFIED
- verification email receipt: USER-VERIFIED
- verification-link transition to `Pending`: USER-VERIFIED
- authenticated Pending visibility: USER-VERIFIED
- automatic access grant before owner approval: NOT EXERCISED and not part of the intended contract
- email inbox placement: **ISSUE — verification message landed in Spam**

No trading, bridge, Pine, strategy, signal, order, risk, TWS, or IBKR behavior is changed by PR #72.

## PR #69 — merged and deployed engineering state

PR #69 (`Harden SMI runtime safety and shared symbol ownership`) is merged to `main` at `160e7541ae1ad48f98e8b720e0929da3fa469083`.

Its website-facing changes are limited to:

- explicit SMI dashboard identity (`VIXALE_SMI_FWD` / `SMI_HISTOGRAM_V0_4_FWD` → `SMI Ergodic`)
- durable close-publication idempotency after Closed Trade persistence

The same PR also contains Engineering-owned bridge/runtime safety changes for SMI EOD fail-safe and shared first-owner-wins symbol ownership across Prime, Edge/Fiona, and SMI. It does not modify Pine research logic or the frozen strategy entry/exit/filter/stop/target/timeframe/session/signal rules.

Render independently showed the PR #69 merge deployment followed by later deployments that contain the PR #69 merge as parent state. Therefore the PR #69 website/backend code remains part of the deployed code lineage. The owner separately confirmed the Windows bridge deployment; that local runtime confirmation remains recorded as USER-CONFIRMED rather than independently checked.

## Canonical dashboard split — PR #68

### `/dashboard` — Live Day Trading Dashboard only

Current intended and last independently deployed/verified presentation contract:

- `/dashboard` is the Day Trading dashboard.
- The viewer Option Journal is not shown on `/dashboard`.
- The `Option Journal` link is not shown in the Day Trading dashboard presentation.
- The Option Straddles note is not shown in the Day Trading dashboard presentation.
- Existing Day Trading positions, working orders, closed trades, and the Day Trading realized Equity Curve remain in place.
- Existing dashboard owner/viewer authorization remains authoritative.

This separation is presentation-only and does not alter trading, signal, risk, order, lifecycle, Telegram, bridge, TWS, or IBKR execution logic.

### `/trading-systems/options` — dedicated Options page

Current intended and last independently deployed/verified presentation contract:

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

Repository implementation was originally merged in PR #26 (`f1b38746b17f17bc9ae0ed5f30bc10d65ca107ab`) and is preserved by later changes.

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

The Day Trading/Options dashboard separation, realized-equity charts, viewer authentication reuse, and public presentation changes must remain independent of trading/execution logic. PR #69 bridge/runtime safety changes are Engineering-owned execution protections and must not be treated as Trading Lab strategy changes.
