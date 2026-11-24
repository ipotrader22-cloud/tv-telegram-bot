# VIXALE Website — November 23, 2026 — Options viewer straddle summary

## Verified deployment identity

This record covers the authenticated Options viewer presentation update, not a
trading-strategy or broker runtime change. Related November 11 Swing valuation
and other website documentation remain valid historical references unless
independently superseded.

- **Options viewer GitHub repository:** `ipotrader22-cloud/tv-telegram-bot`
- **Viewer change:** PR #429, merged commit `f7bbb338d84629ec6b6978073af39b52a5837095`
- **Viewer Render:** service `srv-d86vh7j7uimc73ao479g`, deployment `dep-dc2fe9lbedkc73auifp0` reported **LIVE** at `2026-11-24T02:32:38.762240Z`.
- **ES monitor repository:** `ipotrader22-cloud/es-straddle-monitor`
- **Monitor change:** PR #9, merged commit `69b493e4e7ad101954944f75a3a019320f0bcfb0`
- **Monitor Render:** service `srv-da8ba6gn74is73debqpg`, deployment `dep-dc2fclavcj2c73f6dcu0` reported **LIVE** at `2026-11-24T02:29:10.412937Z`.

The two independently deployed repositories were re-read at their GitHub main
branches, and their relevant source contains the display and message contract.
Render LIVE is deploy evidence, not independent confirmation of any broker
position or quote in an authenticated browser.

## User-visible website change

The Vixale authenticated page
`https://www.vixale.com/trading-systems/options/viewer`
replaces the three generic cards **Manual journal**, **Closed-only equity**
and **One viewer access** with four read-only level cards:

1. **Short Straddle** — strike represented by workbook `Main!P5`, read as
   the validated midpoint of the published website break-even pair.
2. **Open Price** — workbook entry credit `Main!P13`, already published as
   `entry_credit`.
3. **Target** — workbook-derived `Main!S17`, already published as `target`.
4. **Stop** — **display-only** `Open Price × 1.65` rounded to two decimals
   (e.g. 90.50 -> 149.33).

The monitor sends only timestamp, strike, entry credit and target via a browser
`postMessage` from its authenticated iframe to the exact allowed parent origins
`https://www.vixale.com` and `https://ru.vixale.com`. The parent verifies
both the monitor origin and the specific iframe source window. No passwords,
bearer tokens, cookies, broker balances or order instructions are transmitted.
The monitor retains its original HTTP Basic auth and Vixale retains its
original viewer session requirement.

All four cards use real published workbook inputs only. Empty or stale sources
are shown as dashes rather than fabricated last-known live values. The site
has **no broker-confirmed position-active flag** in this read-only feed; a
displayed value does not establish an open IBKR trade. The Stop is a calculated
reference level, **not** an existing stop order, auto-exit trigger or change to
the M0 MAYDAY protocol.

## Validation performed

- HTML source and emitted browser scripts compiled.
- Rendered Options page has four new cards and does not contain the three
  removed cards.
- Protected journal, equity section, iframe, full-chart link and reload
  button remain in the rendered page fixture.
- Controlled monitor-to-viewer message delivery produced: strike 7275,
  entry 90.50, target 80.50, calculated Stop 149.33.
  Those are **test inputs**, not claims about a live position.
- Negative tests checked wrong message origin, wrong iframe window, stale
  timestamps, missing values, data expiration and reload clearing.
- EN/RU labels and the authorized monitor parent origins were inspected.
- GitHub PR diffs were limited to this display contract, regressions,
  documentation and monitor chart template. `app.js` was not modified.

**Limitations:** Authenticated end-to-end browser readback of a genuine active
broker position is not available from the present tools. In particular, the
monitor's protected iframe may require its own sign-in, after which the
Options viewer's Reload chart button refreshes the data. This record does
not certify broker-confirmed position state. The repository's broader
Playwright workflow was provisioning its Chromium environment during the
isolated release checks; do not claim it passed without separate evidence.

## Boundaries and rollback

The change did not modify ES workbook formulas, TWS or RTD integration,
Windows publisher, M0 execution logic, broker orders, VECO strategy logic,
Telegram, stock bridge, journal entries, proof permissions or public options
performance calculation. Roll back PR #429 for the Vixale cards and PR #9
for the monitor message in reverse order, then verify the corresponding
Render deployment SHAs. No data rollback or database migration is required.
