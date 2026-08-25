# VIXALE Website — Project Source of Truth

## Purpose

This directory is the mandatory status index for **VIXALE Website / Design / Copy / Public Pages**.

Before stating that any website state is **CURRENT, LATEST, PRODUCTION, DEPLOYED, ACTIVE, or CANONICAL**, read this file, then read the Current-State manifest below, then re-check the live authoritative source when accessible.

## Mandatory read order

1. `PROJECT-SOURCE-OF-TRUTH/MASTER-INDEX.md`
2. `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE.md`
3. The live authoritative source relevant to the claim:
   - GitHub repository/branch/commit for code state
   - deployment provider/runtime for deployed state
   - live public website for user-visible behavior
4. If any sources conflict, report **CONFLICT / UNVERIFIED**. Do not guess.

## Current-State manifest

- **Website / Design / Copy:** `PROJECT-SOURCE-OF-TRUTH/VIXALE-WEBSITE-CURRENT-STATE.md`

## Repository reference

- Repository: `ipotrader22-cloud/tv-telegram-bot`
- Default branch: `main`
- Developer handbook: `docs/VECO_DEVELOPER_HANDBOOK.md`

The repository reference identifies where the website/dashboard implementation currently lives. It does **not** by itself prove what is deployed to production.

## Scope boundary

This source-of-truth area covers the public Vixale website, public/authenticated dashboard presentation, UX/UI, responsive behavior, branding, copy, and customer-facing data presentation.

It does **not** authorize changes to VECO trading logic, strategy rules, signal generation, order logic, risk logic, TWS/IBKR execution logic, lifecycle rules, or trading algorithms. Website work must remain separated from trading-engine behavior unless the user explicitly requests otherwise.

## Source precedence and conflict handling

For time-sensitive claims, prefer direct verification over stale documentation. A newer explicit user confirmation may supersede an older recorded baseline, but live repository/deployment state should still be checked when accessible.

Never infer production state from:

- the newest-looking filename,
- an old handbook baseline,
- project memory alone,
- a local ZIP snapshot alone,
- a feature branch or open pull request.

A feature branch or pull request is **proposed work**, not production, until merge and deployment are independently verified.

## Maintenance rule

Update the Current-State manifest whenever a website-facing change is merged/deployed or when an authoritative status changes. Record the verification source and date, and keep uncertain operational facts explicitly marked **UNVERIFIED**.
