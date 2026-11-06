# Engine 2 Swing page release preparation

Target November 9, 2026. Prepared November 6. Activation remains pending.

The shared Swing display service selects both Public Feed and Equity History from one workbook. VIXALE_SWING_SOURCE defaults to LEGACY. ENGINE2 selects the existing private Engine 2 workbook. Invalid values fail at startup. The selection is frozen when the service starts. Deployment or restart is required for a switch. Existing owner/viewer authorization and canonical route rewrites remain in the normal application entry points.

Before activation, retain the current production deployment ID, commit, and source setting. Verify the production Google service account can read both ranges in the Engine 2 workbook. Reconcile a current-session staging review and its ledger against those exact formatted ranges. Test the candidate release with the full normal npm start preloads. Sign in as owner and viewer and verify the canonical page and /api/swing-leaders show the same snapshot, holdings, closed trades, model P&L, and equity history. Verify anonymous page requests redirect and anonymous API requests return 401. Check English and Russian output and date-sensitive live refresh. Confirm stale or failed reads cannot be described as a fresh review.

Activate only after those checks pass and production activation is authorized. Set VIXALE_SWING_SOURCE=ENGINE2 and restart/deploy the approved release. Independently repeat the authenticated page/API checks and record the exact production revision and snapshot date. A staging success alone does not certify the production switch.

Rollback: set VIXALE_SWING_SOURCE=LEGACY (or restore its original unset value), restart the service, and verify both page and API use the retained legacy workbook. If the application release fails, redeploy the previously recorded production commit as well. Database and workbook histories need no rewrite. Verify the restored source's actual review date; its retained records may be older than the Engine 2 review.

Local checks passed: existing owner/viewer authorization, route registration, feed parsing, candidate aliases, live refresh, fixed-$10K Active P&L, and source-switch/rollback routing. The pre-existing test_swing_canonical_route_refinement.js fails on main because it expects the older Watch Systems for Free CTA. Resolve that baseline test expectation before a release-ready verdict. Live authenticated production comparison and production service-account access to the private Engine 2 workbook are pending.
