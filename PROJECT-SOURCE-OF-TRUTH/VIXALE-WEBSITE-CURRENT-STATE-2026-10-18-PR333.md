# VIXALE Website — Current-State Manifest

Updated: 2026-10-18 America/New_York.
Repository: `ipotrader22-cloud/tv-telegram-bot`; branch: `main`.

## Issue #331 — Swing Trading authentication

PR #333 was squash-merged as `7f2296c14643c7aaff82604ac9a77007104d9a7c`.
The Render auto-deploy `dep-dbad67m1egvs73di7e7g` for service `srv-d86vh7j7uimc73ao479g` reported **live** at 2026-10-18T14:10:22.967633Z with that exact commit. Build succeeded; application logs show `npm start` and `Server running on port 10000`.

## Access-control implementation

The Swing HTML and API routes use the existing dashboard owner/viewer authorization before serving portfolio data. Canonical `/trading-systems/swing-trading` internally resolves to `/swing-leaders`; direct legacy access redirects to canonical. Unauthorized page requests redirect to existing branded `/login` with strictly allowlisted Swing return; unauthorized `/api/swing-leaders` access returns 401. Access checks fail closed; private/no-store and Vary: Cookie apply. English and Russian Swing copy no longer claims public, password-free portfolio access.

## Verification

- PR #333 GitHub Actions `App Webhook Regression` run #39134657566: **SUCCESS**, including `node --check app.js`, Issue #331 Swing authorization tests, Swing application integration tests and existing regression suite.
- Render deploy status and startup logs for exact merge SHA: **LIVE / PASS**.
- Post-merge production EN/RU browser QA: **IN PROGRESS / UNVERIFIED** at manifest write; run #39134727401. The production workflow is not sufficient evidence of a real owner/viewer credential login unless those cases are explicitly exercised.
- Anonymous HTTP behavior for both public hostnames, valid owner and viewer session behavior, logout, and API cache behavior: **UNVERIFIED by direct end-to-end authenticated browser observation** in this task.
- A public web crawler response may be cached/stale; never infer deployment from crawler content alone.

## Scope and rollback

Website access routing, login return path, logout cookie clearance, Swing presentation, tests, CI and handbook only. No Pine, Trading Lab scoring or writer, trading logic, Google Sheets trading schema, signal generation, bridge, TWS/IBKR or execution behavior changed.

Rollback: revert merge commit `7f2296c14643c7aaff82604ac9a77007104d9a7c` through a reviewed PR and verify the previous deployment. No trading or workbook migration.

This manifest supersedes `VIXALE-WEBSITE-CURRENT-STATE-2026-10-07-PR282.md` for website status; the earlier manifest remains historical.
