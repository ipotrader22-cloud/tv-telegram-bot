# Swing Research Schedule — October 14, 2026 incident / response

The canonical Oct 14 GitHub Actions research input run was created at 18:11Z (14:11 America/New_York) instead of the intended 09:50 ET. The UTC/DST companion time gate skipped price/volume collection, yet the workflow was marked "success" because all downstream steps were conditional. The Swing Morning Publication Verification also ran late, skipped actual publication QA, and reported GitHub workflow success. **Neither workflow created a genuine current-day evidence PASS.**

## Repair
- Split UTC cron schedules into separate entries for EDT and EST to identify the exact scheduled cron expression from `github.event.schedule`.
- If the UTC cron matches the *canonical* current-DST target but the job starts in an invalid ET hour, fail the run loudly rather than green-skipping every substantive step.
- If the cron belongs to the *intentional DST companion* that should not run today, allow a clean SKIP, but explicitly label it as no evidence.
- `workflow_dispatch` remains available for read-only recovery. Re-running an old scheduled workflow must NOT be treated as correct-time execution evidence.
- The 10:00 primary and 10:25 recovery cloud tasks remain the **only** active score/Research Notes writers in their authorized 10:00–10:20 and 10:25–10:35 ET windows. Do not retry financial updates outside those windows.
- Missing GitHub OHLCV means use independently retrieved dated market history and 250 completed bars when the cloud writer is in-window; missing input should be diagnosed, not replaced with invented factors or skipped publication falsely called complete.

## Verification and limitation
This change closes the false-GitHub-success diagnosis, but DOES NOT guarantee GitHub hosted jobs will run on time. Operators must verify actual date-scoped source artifacts and publication fingerprints, not merely a successful workflow conclusion. The Oct 14 live Sheet still showed Oct 13 full-review dates across the three active symbols and five candidates during evening readback. No Sheet writes or false date advances were made in this repair.
