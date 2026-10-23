# Engine 2 staging: 10:00 review using 09:40 model prices

Status: owner-approved scenario, 2026-10-23; implementation and real-run acceptance pending.
Scope: PR #329, private staging workbook and shadow page only. No broker orders,
production cutover, production workbook writes or email. This document supersedes
the proposed current-price 10:00 staging scenario, not production trading rules.

## Session timeline

1. Before 09:30 America/New_York, including overnight after the preceding session
   has completed, collect that session's final daily prices/volumes and required
   historical inputs. Friday is the reference session for an ordinary Monday;
   use the market calendar for holidays and shortened sessions.
2. Re-score existing holdings and new candidates using the established nine-rule
   contract. Persist an immutable, dated candidate artifact before market open.
   Queue existing positions for exit when their rating falls below the applicable
   threshold or completed-session evidence proves a stop/target condition.
   A daily closing price alone must not be presented as proof that a level was
   never touched intraday. Preserve per-position evidence and the trigger reason.
3. At 10:00 ET, retrieve the same session's historical 09:40 prices. Process
   queued exits first, release model capital, then eligible entries in a stable
   ranking order. Do not recompute yesterday's ranking from later daily bars.
4. Mark retained holdings using the same 09:40 price convention. Commit once,
   then publish and compare the ledger, private Sheet, API and HTML.

The existing staging universe remains ten configured symbols for integration
testing. It is not a broad market scan; production universe expansion and full
qualitative-factor coverage are separate unfinished gates. No invented scores
or forced entries. Existing ten-position / $10,000-per-position policy remains;
there is no two-new-entries-per-day cap.

## Exact price convention for implementation

Use the close of the completed one-minute regular-session bar ending at 09:40 ET
(the interval [09:39,09:40)). This is a reproducible model reference, not a claimed
exchange LAST at exactly 09:40. A bar labelled 09:40 at its start ends at 09:41
and must not silently be substituted. Preserve start/end timestamps explicitly.

Use this price for both queued exits (including stop/target-triggered exits) and
new entries. Do not book an exit at the stop or target level, yesterday's close,
or the current 10:00 market price. Stops and targets identify the exit reason;
they do not promise a protected execution price.

The 20-minute lag is the owner's chosen model convention, not a claim that Yahoo
always has a universal fixed delay. Verify actual source timestamps. Even if
newer prices are available, select the fixed 09:40 cutoff. Never use runAt minus
20 minutes: a 10:04 retry must still use the same 09:40 observation.

Persist separate researchSessionDate, preparedAt, decisionAt, priceAsOf, fetchedAt,
publishedAt, provider, source hashes, rule version and price policy identifier
(DELAYED_0940_MODEL_V1). Execution/fill terminology must not imply a broker fill.
A new model lot has effective model time 09:40 and actual decision time at or
after 10:00; never overwrite the latter with the historical model time.

## Blocking and recovery

Missing exact bar, invalid OHLCV, missing holding marks, conflicting duplicate
timestamps, incomplete trigger evidence, wrong session, missing pre-open artifact
or changed artifact hash blocks the financial cycle with a specific reason.
Do not forward-fill, interpolate, use a nearby bar or merely relax the existing
five-minute freshness check globally. No stale portfolio may appear updated.

Retain existing 10:00-10:05 fresh-decision and 10:00-10:20 publication-recovery
windows unless explicitly revised. Retries use the frozen candidate artifact and
fixed cutoff; an already committed cycle is replayed without duplicate trades.
The pre-open preparation needs a separate scheduled stage and durable storage;
the current morning-only cron is not evidence that this stage exists.

Before implementation, explicitly reconcile the old 09:30 opening-stop and
intraday-target mechanisms with this queued-next-review model. Do not run both
exit policies against the same lot, and do not silently invent treatment for
new triggers between the prior close and 09:40. Preserve production behavior.

## Visible staging labels

EN: Model portfolio · Review at 10:00 ET · Model prices as of 09:40 ET.
RU: Модельный портфель · Расчёт в 10:00 ET · Модельные цены на 09:40 ET.
Show actual publication time separately if delayed. Label staging prominently.
Show the source session for ratings and the source time for marks. Do not claim
actual fills, real-time quotes, guaranteed target/stop fills or live production.

## Acceptance cases before activation

- A Monday and holiday-adjacent run selects the correct completed session.
- Preparation after 09:30, future inputs or an incomplete session is rejected.
- Exact 09:40 bar-end selection is identical at 10:00 and 10:04; a 09:40-start
  bar, missing exact bar and newer source bars cannot change the chosen price.
- Close-trigger reason is retained while accounting uses the 09:40 model price.
- Exits precede entries; capital, position cap and fixed sizing reconcile.
- Retained holdings and new/closed positions share the price convention; no
  holding is valued using yesterday's or a different minute's price.
- Conflicting duplicates, incomplete evidence, unavailable source and clock
  mismatch fail closed without partial financial writes.
- Repeated invocation/restart produces one immutable cycle and no duplicate lots.
- Sheet/API/HTML agree on positions, cash, realized/unrealized P&L, dates and
  policy labels; EN/RU labels do not imply actual broker execution.
- Real staging provider/authentication/write/readback passes; fixtures alone
  do not certify deployment. Email remains disabled.

## Current readiness

The deployed cron still uses the older same-morning collection and five-minute
quote freshness logic. This document does not implement the scenario. The new
scenario must not be called ready for Monday solely because credentials are
installed or the old cron deployment is live. Implement and test the pre-open
artifact, exact-cutoff pricing, accounting and display changes before activation.
Rollback preserves all journal history and disables only the staging publisher.
