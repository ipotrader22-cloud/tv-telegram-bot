# ES Straddle Machine — isolated TWS paper candidate

Handbook update required: YES.

## Owner-approved strategy — November 16, 2026

At 20:20 America/New_York on eligible ES trading evenings, sell ten
straddles (ten calls plus ten puts) as one ratio-1:1 CME BAG. Use the verified
current ES futures contract, nearest available ATM strike (tie: lower strike),
same strike and PM expiry for both legs. Choose the earliest listed upcoming
expiration within four calendar days, verified by both IB ContractDetails to
expire at 16:00 ET. Require the same underlying conId, $50 multiplier, USD, and
an IB trading-hours interval open at entry. Never infer PM expiry from a symbol
or use a stock-market holiday calendar for ES. Missing/ambiguous PM metadata,
closed sessions and early expiries skip entry.

Sell at the initial combined bid/ask midpoint. Freeze that limit; never chase
or use a market entry. The exact midpoint must lie on the locally verified combo
tick grid; otherwise skip instead of silently repricing.

Profit BUY LMT = ceil(actual weighted entry credit * .865 / .25) * .25.
50.50 credit -> raw 43.6825 -> 43.75. Exact quarters stay unchanged.

Mayday triggers when fresh real-time call ask + put ask >= actual weighted
entry credit * 1.65. Cancel/confirm the target and market-close the proven
residual. 50.50 credit -> 83.325 trigger. This is a trigger, not a guaranteed
execution price. The combined leg asks can differ from a native combo quote;
this explicit buyback-cost interpretation requires supervised paper acceptance.

At expiry-day 15:55 ET, irrespective of quote freshness, cancel the remaining
entry and target, confirm termination, then close the execution-proven residual.
An unfilled entry waits unchanged until this cancellation. No fill means no
trade. First partial entry cancels its unfilled remainder; after confirmation
and position synchronization the target covers actual final filled quantity
at the actual weighted premium. No old research exits, MES hedge or second
target are activated.

## Architecture and operation

Standalone package es_straddle, never imported by the stock bridge or app.js.
No Render, chart, Telegram, workbook, stock execution or secret changes.
core.py is a deterministic command coordinator. tws.py observes real contracts,
quotes, orders, executions and positions, persists write-ahead reservations,
then performs broker effects. Submission or a market touch never means fill.

ONLY an exact DU paper account on loopback 7497/4002 is accepted, with a nonzero
client ID and explicit --paper-execute. Default is read-only preflight.
There is no live-account override in this candidate.

Both BAG legs are BUY oriented. SELL of this BAG shorts both for positive
credit; BUY closes both. ENTRY is DAY, TARGET GTC, closing MKT is DAY.
outsideRth is enabled for the futures-options session. Actual exchange
acceptance must be observed in TWS; Python types alone do not prove support.

Use Python 3.11+ on the TWS computer in a separate checkout/environment:
  python -m pip install -r es_straddle/requirements.txt

Independently verify the DU paper account, API port, unique nonzero client ID,
current ES future conId (not continuous/MES), real-time options permissions,
clock, and combo minimum price increment. Never commit account values.

Read-only preflight, substituting verified local values:
  python -m es_straddle --account DU_PAPER_ACCOUNT --underlying-id ES_CONID --combo-tick VERIFIED_TICK --state-dir C:\es_straddle_state

After supervised paper authorization, add --paper-execute to that command.
Start before 20:20 ET; keep running through exit and subsequent eligible nights.
The local process owns timing; no ChatGPT scheduled trading task is installed.
Friday/Saturday entries are skipped. Review the explicit underlying conId on
futures rollover. An expired/wrong future must not be hidden by a continuous
symbol. A PR, installation or --help does not log in, schedule or place orders.

Keep a persistent state directory outside the repository. Never run another
copy with a different state directory to evade locks or ownership checks.

## Bounded guarantees and remaining gates

- Filesystem process lock; atomically replaced, fsynced command reservations
  BEFORE broker effects. Storage failure prevents the effect.
- All-client visible orders and exact account/contract ownership checks.
  Exact refs and execution IDs distinguish fills. Position on BOTH legs must
  equal confirmed entry fills minus confirmed exit fills before market orders.
- First partial entry cancels the remainder before target placement. Unknown
  cancellation/acknowledgment stays blocked, never blindly resubmitted.
- Target fill during cancellation produces no reverse close. A partial target
  closes only its synchronized residual. Stale positions prevent submission.
- One market close outstanding; at most two residual replacements after proven
  terminal failures, retaining cumulative fills. No timeout cancels a working
  partial market order merely to retry.
- Mayday is a LOCAL watchdog, not a broker-native stop. It and 15:55 require
  this process/network/TWS/data connection. A GTC target may remain broker-held
  after failure; no emergency execution guarantee applies during outages.
  Market orders can slip or be rejected.
- Active-session restart recovery and automatic reconnect/history proof are
  NOT implemented. Connection continuity loss blocks effects. Unresolved
  journals block restart pending broker reconciliation; never delete them
  to retry. No prior-day execution coverage is inferred from today's history.
- Supervised TWS paper acceptance must verify actual combo support, expiry/time
  metadata, tick grids, fill shapes, target acceptance, partial fills,
  cancellation race, Mayday, EOD, interference and restart/disconnect behavior.
  Resilient recovery remains required before unattended live promotion.
- Entry tolerance is the 20:20 minute. Slow preflight or missing real-time data
  skips rather than submitting late. IB metadata can conservatively skip
  entries when it cannot prove a session/PM contract.
- No chart or Option Journal publication is added. Existing publisher and
  stock bridge remain separate.

## Offline verification

  python -m compileall -q es_straddle tests/test_es_straddle.py
  python -B -m unittest discover -s tests -p test_es_straddle.py -v

CI runs these on Python 3.11/3.12, installs the pinned adapter dependencies and
checks --help without broker access. Fixtures test pricing, PM expiry/DST,
no chase/no fill, partial entries, Mayday threshold/stale data, EOD,
target-cancel races, residual sizing, unknown acknowledgments, ownership,
continuity, retry caps and exact execution evidence. Offline success is not
broker acceptance or proof of Windows installation.

## Rollback

Stop only this isolated candidate. Inspect/reconcile its owned paper orders
and positions; preserve journal and unresolved GTC orders until reconciled.
Never stop the stock bridge or TWS as part of this rollback.
Reverting source does not cancel broker orders. Revert only this candidate PR;
no production environment or financial-history rollback is required.
