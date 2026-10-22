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
Source/test status only until the merge/deployment evidence below is updated.

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

Fix PR: pending.
Merged fix SHA: pending.
Render deploy for fix: pending; no claim of live fix yet.
Post-deploy connected-browser verification: pending.

## Boundaries and rollback

Host-only sessions still require separate EN/RU login. No change to cookie
Domain, HttpOnly/Secure/SameSite, configured validity, viewer approval or code
expiry, credentials, production environment, public data schemas, Google Sheets
writers, Trading Lab, VECO/Pine/strategy/risk logic, bridge, TWS/IBKR or orders.

Rollback: revert this task's code merge through a PR, let the normal main
Render deployment finish and verify the prior behavior. No data migration or
credential rollback. Source and deployment baseline details from PR #333 remain
in the historical October 18 manifest.
