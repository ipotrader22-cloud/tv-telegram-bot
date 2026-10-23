# SMIO stale ENTRY_FILL publication prevention (2026-10-23)

Incident: October 22 COP SMIO BUY 693 was broker closed at 15:55:20 ET
with SMIOC-owned closing order. Restart broke prior-day execution history
coverage; the SMIO entry callback remained queued and was delivered on
October 23 at 08:00 ET, creating a false OPEN publication.

This change is publication-only: for SMIO ENTRY_FILL callbacks, compare the
original signal-bar New York calendar date to the bridge publication date.
If the signal is from a prior New York date (or its timestamp is unproven),
return a fail-closed response to the outbox worker instead of calling Render.
Keep the original outbox item for explicit review. EOD_CLOSE/TP and other
events are unaffected. No bridge order submission, stop/target calculation,
strategy rule, broker history gate, or general Prime/Edge forwarding changes.

Limitation: this prevents **new stale historical entry publications from the
bridge's outbound sender**, but it does not prove broker flat or prevent an
already delivered callback from being displayed. Legitimate overnight SMIO
entries delayed into the following day are quarantined for review rather than
published incorrectly. This is deliberate fail-closed behavior.

Required before deployment: run scoped Python tests; verify the complete diff,
evaluate outbox retry frequency/log visibility and any alternate publication
paths, then install the reviewed bridge source on Windows and verify its SHA.
GitHub/Render merge does NOT deploy C:\\ib_bridge. Do not automatically
replay/drop old outbox items. Do not re-publish COP to Telegram.
