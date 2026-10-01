# VIXALE Website — Current-State Manifest

Updated: 2026-10-01 America/New_York.
Repository: `ipotrader22-cloud/tv-telegram-bot`, production branch `main`.

## Dashboard Access health monitor — PR247

Website-facing PR #247, `Add dashboard access health monitor`, was squash-merged to `main` as commit `aebacab799716baade059594ae169b84c5a32310`.

Render production service: `tv-telegram-bot` (`srv-d86vh7j7uimc73ao479g`).
Render workspace: `Trader's workspace` (`tea-d86vflpkh4rs73f3t7n0`).
Render deploy: `dep-davescbtqb8s73fa4pcg`.
Render deploy status: **live**.
Render deploy finished: `2026-10-01T23:36:01.908556Z`.

## Production behavior

The authenticated `/admin/live` implementation now includes a `Dashboard Access System` health panel with component status for the access form, Cloudflare Turnstile, Google Sheet logging, Resend, verification email history, and owner notification configuration. It also surfaces the latest access request / latest failed request when available and provides `Run Test Now`.

The monitor runs an automatic synthetic check every 30 minutes. Synthetic mail uses Resend's test recipient `delivered@resend.dev`; it does not create a customer Dashboard Access Request row and does not create a dashboard viewer code.

Failure/recovery transitions use the existing owner-email / admin-Telegram notification paths when those channels are configured and usable.

## Verification status

- GitHub PR #247 CI (`Production EN/RU Browser QA`, run `36941511340`) completed successfully for the PR head.
- GitHub `main` merge commit directly verified as `aebacab799716baade059594ae169b84c5a32310` at the feature deployment check.
- Render exact deploy `dep-davescbtqb8s73fa4pcg` directly verified **live** for that commit.
- Render startup logs verified the new health preload was present in `npm start` and the server reached `Server running on port 10000` without a health preload startup error.
- The first automatic production synthetic check sent at `2026-10-01T23:36:15.218Z`; Render logged Resend message ID `01a0f9d3-6821-7357-bde8-03f86e6d0980` and Resend independently reported that message **delivered** to `delivered@resend.dev`.
- No Dashboard Access health-alert email was emitted during the first startup check, consistent with the monitor not detecting a core-component failure at startup.
- Direct external browser verification of the authenticated `/admin/live` health card is **UNVERIFIED** in this maintenance run because the external browser surface cannot access the admin session. Do not upgrade this to browser-verified until checked in an authenticated browser.

## Operational limitation

The 30-minute monitor runs inside the Vixale web process. It can detect failures of the Dashboard Access dependencies while the service is running, but it cannot execute if the entire Render service itself is unavailable. Whole-service outage detection therefore remains outside this in-process monitor.

## Safety boundary

PR247 changes only website/admin monitoring and Dashboard Access observability. It does **not** change VECO trading logic, strategy rules, signal generation, order logic, risk logic, TWS/IBKR execution logic, lifecycle rules, or trading algorithms.

Implementation files changed:

- `website_dashboard_access_health.js`
- `tests/test_dashboard_access_health.js`
- `package.json` (preload registration only)

Rollback: revert PR247 / merge commit `aebacab799716baade059594ae169b84c5a32310` and deploy. No trading-state, Google Sheet request-data, or broker rollback is required.

This manifest supersedes `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE-2026-10-01-PR245.md` as the website Current-State manifest. The PR245 manifest remains the historical verified Swing live-refresh baseline; unrelated website areas retain their prior records.
