# VIXALE Website — Issue #337 Current-State Manifest

Updated: 2026-10-22 America/New_York.
Repository: `ipotrader22-cloud/tv-telegram-bot`.

## Verified deployment before this fix

GitHub `main` and Render production both use
`a8eba48b914277069c3ca4e4d1595c3bff3cc6ae`.
Render service `srv-d86vh7j7uimc73ao479g`, workspace
`tea-d86vflpkh4rs73f3t7n0` (owner-confirmed Trader's workspace), reports deploy
`dep-dbad79m90tus73cj39m0` **live**. Service tracks `main`, Auto-Deploy **yes**,
trigger **commit**, start command `npm start`, one Starter instance and the
existing `/var/data` disk. Runtime/cache settings were read only, not changed.

## Verified root cause

Connected Chrome on EN and RU reproduced Dashboard -> Home -> Day Trading ->
public overview, then Log In -> Dashboard without a new credential prompt.
Dashboard hard reload and history navigation retained authorization. The
reported same-host symptom is a routing mismatch: canonical Day Trading always
rendered the public product page, even for an existing authorized session.
The static Log In link is not evidence of cookie loss.

## Implementation and validation

Feature branch: `fix/337-day-trading-session-navigation`.
Implementation is merged and deployed; exact evidence follows below.

The exact Day Trading GET/HEAD path checks existing owner/viewer authorization
using originalUrl despite website preload rewrites. Valid sessions redirect to
the same-host protected Dashboard; anonymous/expired/invalid sessions retain
the public overview. Session-dependent responses, Dashboard and logout use
private no-store and Vary: Cookie. Cookies are neither renewed nor widened.
Unexpected authorization errors fail closed. Existing protected APIs and Swing
Issue #331 guards remain enforced.

`node --check app.js` and the full-production-preload HTTP regression pass.
Chromium fixture QA passes EN/RU x 1440/390px x owner/viewer: credential login,
Home -> Day link, fresh/reload, back/forward, logout/history and expired session.
HTTP checks also cover signed-cookie security attributes, HEAD, forged sessions,
revoked/expired viewer codes, anonymous Swing page/API denial, cache headers and
authorization error behavior. All fixtures use disposable credentials and
mocked Sheets, never production trading/account writes.

Scoped Swing authorization, public Dashboard P&L/equity, Day hero, navigation,
Russian localization, broker callback, SMIO, option payload, webhook durability
and Edge Pending checks pass. The broad Edge integration assertion about
rendering canonical setup_id fails identically on unchanged main and this
branch; the established CI comparison gate handles that pre-existing failure.
The old product-page test also fails unchanged on main because it still expects
Swing data to be public; this task preserves Issue #331 protection.

## Merge/deployment evidence

Fix PR: #338, squash-merged after required App Webhook Regression run
`39779537559` completed **success**. Branch commit:
`bbbb08aaefd55c928dd6074d33849ebe747393b3`; its Git tree
`2216f06819d4059ec473f9fa709fdf05cc8f712f` exactly matched the locally tested tree.
The connected GitHub app published the reviewed blobs after shell push lacked
credentials; no direct main push or force push was used.

Merged fix SHA: `6dea2b38ef1753a4b370dc37c4e668e2f42fe9dc`.
Normal Auto-Deploy `dep-dbd06f5g1s2s738i1c6g` reported **live** at
`2026-10-22T12:36:54.944833Z` with that exact SHA. Application startup log:
`Server running on port 10000` at `2026-10-22T12:36:53.180358285Z`.
No error-level app logs were returned for the initial post-live inspection.

Post-deploy connected Chrome **PASS**: existing valid sessions on EN and RU
return from Home through the normal Day Trading link directly to the private
Dashboard, without clicking Log In or re-entering credentials. Desktop and
mobile layouts were checked (automated fixture: 1440/390px; connected mobile
content widths: EN 417px with existing site zoom, RU 375px). Mobile back -> Home,
forward -> Dashboard and hard reload preserve the private view on both hosts.
A RU tab caught a transient 502 during the disk-backed service restart; a
reload after Live restored its valid session. No infrastructure setting changed.

Anonymous production HTTP checks on both hosts **PASS**: canonical Day page
200 with private no-store and Vary: Cookie; Dashboard 302 to /login with the same
cache protections; Swing API 401 with private no-store and Vary: Cookie.
Owner/viewer credential-login, logout and expiry were fully exercised in the
isolated HTTP/Chromium fixtures. Fresh production viewer-code login, production
logout and deliberate production expiry were not performed; live checks reused
existing approved browser sessions and do not claim those additional cases.

This documentation follow-up records the verified runtime SHA. A documentation-
only merge may advance GitHub main beyond that SHA without changing runtime
code; `[skip render]` avoids an unnecessary second service restart.

## Boundaries and rollback

Host-only sessions still require separate EN/RU login. No change to cookie
Domain, HttpOnly/Secure/SameSite, configured validity, viewer approval or code
expiry, credentials, production environment, public data schemas, Google Sheets
writers, Trading Lab, VECO/Pine/strategy/risk logic, bridge, TWS/IBKR or orders.

Rollback: revert this task's code merge through a PR, let the normal main
Render deployment finish and verify the prior behavior. No data migration or
credential rollback. Source and deployment baseline details from PR #333 remain
in the historical October 18 manifest.
