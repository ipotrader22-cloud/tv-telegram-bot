# Engine 2 Swing page rollout record

Owner authorized production activation November 8, 2026. Preparation notes below are historical; the deployment evidence section records actual activation.

The shared Swing display service selects both Public Feed and Equity History from one workbook. VIXALE_SWING_SOURCE defaults to LEGACY. ENGINE2 selects the existing private Engine 2 workbook. Invalid values fail at startup. The selection is frozen when the service starts. A normal deploy is required to apply a changed source setting; Render Restart retains the running deployment configuration. Existing owner/viewer authorization and canonical route rewrites remain in the normal application entry points.

Before activation, retain the current production deployment ID, commit, and source setting. Verify the production Google service account can read both ranges in the Engine 2 workbook. Reconcile a current-session staging review and its ledger against those exact formatted ranges. Test the candidate release with the full normal npm start preloads. Sign in as owner and viewer and verify the canonical page and /api/swing-leaders show the same snapshot, holdings, closed trades, model P&L, and equity history. Verify anonymous page requests redirect and anonymous API requests return 401. Check English and Russian output and date-sensitive live refresh. Confirm stale or failed reads cannot be described as a fresh review.

Activate only after those checks pass and production activation is authorized. Set VIXALE_SWING_SOURCE=ENGINE2 and deploy the approved release. Independently repeat the authenticated page/API checks and record the exact production revision and snapshot date. A staging success alone does not certify the production switch.

Rollback: set VIXALE_SWING_SOURCE=LEGACY (or restore its original unset value), deploy the approved commit with the restored environment, and verify both page and API use the retained legacy workbook. If the application release fails, redeploy the previously recorded production commit as well. Database and workbook histories need no rewrite. Verify the restored source's actual review date; its retained records may be older than the Engine 2 review.

Local checks passed: existing owner/viewer authorization, route registration, feed parsing, candidate aliases, live refresh, fixed-$10K Active P&L, and source-switch/rollback routing. Updated the stale canonical route test to the existing portfolio-anchor CTA; no UI behavior changed.

Live production login verified November 6: anonymous canonical page redirected to login; successful sign-in returned to the canonical Swing page. It still shows the legacy October 16 10:08 ET publication, one active PLTR, five candidates. This proves current authenticated access, not Engine 2 integration. Rollback restores this legacy source and must not describe it as current.

Remaining gates: production service-account access to the private Engine 2 workbook; candidate deployment with normal startup preloads; authenticated candidate page/API parity including English/Russian and fresh review date; remote CI (no workflow run associated with initial release commit at inspection). Do not activate based only on local fixture tests.

November 6 follow-up: full Express startup with all production preloads and real owner/viewer login POSTs now passes locally for EN/RU, anonymous denial, page/API snapshot ID equality, equity history, cache headers and logout. Replayed the freshly read November 6 staging feed/history (not checked into Git); found and fixed the exact Engine 2 quote-source label and accounting zero/template-row incompatibilities. Fixtures additionally test malformed history rejection. Both source modes are exercised in a dedicated CI workflow; execution must be verified separately.

The existing redesign staging service has only VIXALE_WORK_REDESIGN_PREVIEW configured, with no secret files or linked environment groups. It cannot test live Sheets or signed login. Do not copy production secrets into it. Provision/configure an isolated website service with a dedicated owner credential, an isolated authentication workbook and a Google service account scoped to the intended test resources. Engine 2 Public Feed and Equity History reads must succeed from the service itself before activation.

## November 7 live staging configuration and precision repair

The dedicated website staging service `srv-dbn675ui0phs73857rp0` runs this release branch with `VIXALE_SWING_SOURCE=ENGINE2`, bridge forwarding/manual tests disabled and bridge dry-run enabled. The owner explicitly authorized transfer of the existing Engine 2 staging Google credential from the observer. Its identity was verified as `vixale-engine2-staging@tv-trading-journal.iam.gserviceaccount.com`; no production credential was copied. A separate owner credential is stored only in Render.

`GOOGLE_SHEET_ID` is the isolated access workbook `1L-83r5NP5iP8gwN1fpWaypnxM7axRLf3bkwEYy1Hvrg`. The staging account has writer access there. Empty Pending, Open Positions, Closed Trades and Trades tabs satisfy the shared app's operational readers; no model or broker rows were inserted. Engine 2 financial reads continue to use the distinct workbook selected by the source wrapper. Set `SITE_BASE_URL` to the staging origin, otherwise the existing same-origin guard correctly rejects staging administration forms with 403. Render's environment-update API triggered normal deployments even though Git auto-deploy is off; inspect deployments before manually triggering another.

Deployment `dep-dbnrod6417fc73eil480` of `ec9dafb` reached Live at 19:03:47 ET November 7. Authenticated owner page/API returned matching fingerprint `35137aeb4ea0628e08355bd6` and the November 6 10:00 ET feed: zero active, five candidates, closed CVX/XOM, latest history P&L -1011.37. These were checked against fresh direct workbook reads. Browser sign-in and rendered page succeeded. No app error logs were returned for the checked interval after that deployment. The public staging hostname renders English; Russian routing is separately tested with the full application locally and in CI, not claimed live on a Russian staging domain.

The rendered page exposed a real precision bug: aggregate P&L was -1011.00 while trade rows/history were -1011.37. Aggregation previously multiplied rounded displayed returns. It now sums fixed-$10K returns from entry and current/exit prices, rounding only the final aggregate, consistently with individual row calculations. Share counts and displayed rounded percentages never determine model dollar totals. Tests cover the observed two-trade loss, sub-percent price movements, a zero exit, empty portfolios and invalid prices. This changes displayed aggregate cents, not ledgers, scores, entries/exits or Q/R controls. The precision repair must be deployed and verified before treating that display discrepancy as closed.

Production activation and production Google-account access remain separate gates. This staging setup does not authorize a main merge or cutover. Preserve the verified legacy production deployment `dep-dbliq3favr4c73cu79c0` / commit `0ab75ceec6b94b53e6ab13f38af6707d126e08ab` as a historical rollback baseline and re-read its current state before any activation.

Live viewer acceptance also passed using a disposable one-day code in the isolated access workbook: login, matching page/API fingerprint, denial of owner administration, anonymous redirect/401 and rejection of an invalid Origin. The code was disabled through the owner endpoint and a subsequent login returned 401. Full-preload EN/RU owner/viewer replay of fresh November 6 source ranges passed after the precision fix.

## November 8 production access and deployed rollback evidence

The owner explicitly instructed connection of vixale.com. Production account `fvg-sheets-bot@tv-trading-journal.iam.gserviceaccount.com` received reader-only access to the Engine 2 financial workbook. Permission readback and actual Google API reads executed inside the production Render instance verified Public Feed and Equity History access to both Engine 2 and the retained legacy workbook. No production Google credential was moved.

PR #379 merged as `402931e73904e6e2b39de342212dc04a1fc88afa`. Its tree matches the locally tested merge with current main `77c7c3f`; homepage-video changes are preserved. The existing three release CI runs passed. Full-startup owner/viewer EN/RU tests passed in both source modes on the combined tree; homepage regression and app syntax passed.

Actual normal production deployments, all on that same application commit:

| Source | Deployment | Verified Live UTC |
| --- | --- | --- |
| Default LEGACY after merge | dep-dbo8d8g473hc73aamg90 | 2026-11-08 14:27:31 |
| ENGINE2 initial activation | dep-dbo8dtp5efls73d56qe0 | 2026-11-08 14:29:07 |
| LEGACY rollback rehearsal | dep-dbo8esbm8hqs73frjds0 | 2026-11-08 14:31:22 |

Authenticated production EN/RU HTTP checks verified page/API fingerprint equality, HTTP 200, no-store headers, valid feed/history, and anonymous API 401/page 302. ENGINE2 fingerprint `f393d84333f56905a8e27974`: November 6 10:00 ET, zero active, five candidates, closed CVX/XOM, realized model P&L -1011.37. The connected production browser displayed matching values. Rollback fingerprint `9a5ba0cea451ada958611ec6`: retained October 16 snapshot, one PLTR, 12 historical closed lots. Both domains passed the deployed rollback check; the connected browser also returned to the legacy page. The legacy source is old, not a current strategy review.

The existing writer cron remains unsuspended on its Engine 2 branch with `0-20 12-15 * * 1-5` UTC. Its names still include staging; source activation does not rename infrastructure or change its schedule. No new orders, ledger events, email sends, or customer-access changes occurred. Sunday activation cannot certify Monday's future research cycle.

Final ENGINE2 deployment `dep-dbo8frpsrm7s73b8ip20` reached Live at 2026-11-08 14:32:54 UTC (09:32:54 EST). Final owner-authenticated EN/RU page/API parity passed again with fingerprint `f393d84333f56905a8e27974`. Connected-browser page and screenshot show the same November 6 snapshot and -$1,011.37. Independent external checks: /health 200, anonymous API 401, anonymous canonical page 302. Error-log query from final Live through 14:34:07 UTC returned no errors. Brief 502 responses occurred during the normal restart windows; the final service is healthy.

The rollout is complete. Monday November 9's future market review is not claimed verified. No background monitoring was created by this deployment.
