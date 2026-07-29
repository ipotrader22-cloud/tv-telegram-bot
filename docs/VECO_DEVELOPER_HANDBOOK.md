# VECO Developer Handbook

**Project:** Vixale Ecosystem (VECO)  
**Status:** Living canonical reference  
**Last updated:** 2026-07-28
**Owner:** Viktor / Vixale  
**Canonical Git location:** `/docs/VECO_DEVELOPER_HANDBOOK.md`  

> **Rule:** Any architectural change, routing change, schema change, deployment change, naming change, or newly discovered gotcha must update this handbook in the same patch. The Git version is the single canonical reference; conversational memory is auxiliary.

---

## 1. Purpose and Scope

**VECO** means the complete Vixale production ecosystem:

- TradingView strategy alerts
- Render / Node.js webhook and website service
- Telegram signals
- Google Sheets trade ledger
- Vixale website and private dashboard
- Local FastAPI IB bridge
- Interactive Brokers / TWS execution

This document is the canonical memory for the project. It should be read before production changes.

This handbook does **not** replace source code. When this document conflicts with deployed code, the deployed production code is the immediate source of truth and the conflict must be resolved in this handbook.

---

## 2. Non-Negotiable Architecture Rules

### 2.1 Execution-first publishing

VECO must not publish a position as OPEN until TWS confirms a real fill.

Expected flow:

```text
TradingView alert
→ Render accepts payload
→ Render forwards to local IB bridge
→ IB bridge submits order to TWS
→ TWS confirms fill
→ IB bridge sends callback to Render
→ Render publishes Telegram / Sheets / dashboard OPEN
```

A submitted, pending, rejected, blocked, or unfilled broker order must not appear as an OPEN trade.

### 2.2 No fake closes

A close alert must not create a closed trade unless the bridge confirms a real broker close fill or a managed target fill.

If the broker is already flat and no matching open row exists, the close must be ignored rather than creating a duplicate or fake result.

### 2.3 Surgical production changes

Production patches should:

- modify the smallest possible surface;
- preserve existing routes and payload contracts;
- avoid rewriting working systems;
- avoid touching website forms, login, dashboard, Sheets, Telegram, or TWS unless required;
- include a complete final file, not a code snippet;
- preserve backward compatibility with existing TradingView alerts whenever possible.

### 2.4 Stock-only production

Current production execution is stock-only. Futures support is postponed until explicitly approved.

---

## 3. Current Production Systems

### 3.1 Vixale Prime (internal Shrek)

**Public VECO name:** Vixale Prime
**TradingView strategy:** `Shrek 1.4`
**Internal strategy ID:** `SHREK_1_4`
**Variant field:** not used

Logic:

```text
SuperTrend flip
→ freeze broken SuperTrend level and ATR(14)
→ wait for pullback touch
→ require reclaim on candle close
→ market entry
→ attached ATR target in TWS
→ close on target, internal opposite SuperTrend flip, or bridge watchdog at 15:59 ET
```

Telegram lifecycle:

```text
🟢 / 🔴 Vixale Prime opened LONG / SHORT
🎯 Vixale Prime hit target
🛑 Vixale Prime hit Stop Loss
⏰ Vixale Prime EOD close
```

Opening Telegram messages include:

- Entry
- Target
- Stop Ref
- Quantity

### 3.1.1 Vixale Prime / Shrek 1.4 naming contract

TradingView and VECO use one canonical strategy identity:

```text
Visible TradingView title: Shrek 1.4
Payload strategy ID: SHREK_1_4
```

The Pine payload does not send a `variant` field. Render and the local bridge recognize
`SHREK_1_4` directly. Legacy Shrek/Opposite-Flip identifiers remain accepted only so
already-created old alerts can be retired safely. These internal and TradingView identities
remain unchanged; only public rendering uses `Vixale Prime`.

### 3.2 Vixale Edge (internal Fiona)

**Public VECO name:** Vixale Edge
**Canonical Pine source:** `/pine/Vixale_Edge_Limit_Pullback_v1_1.pine`
**TradingView title:** `Vixale Edge 1.1`
**Internal strategy:** `VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1`
**Internal variant:** `FIONA_LIMIT_PULLBACK_ATR_TARGET`

Logic:

```text
SuperTrend flip
→ only a confirmed RTH bar before the closing bar may create a setup
→ freeze Flip Close or Broken STL anchor
→ freeze ATR(14)
→ publish PENDING_SETUP with a stable setup_id
→ place resting TradingView limit order
→ on TradingView historical/live limit fill, send SETUP
→ bridge executes TWS MARKET entry
→ broker-confirmed ENTRY_FILL moves Pending to Open
→ attach frozen ATR target
→ close on target or internal confirmed-RTH opposite SuperTrend flip
```

Part 3A bridge isolation makes Vixale Edge an explicit execution family before
generic Opposite Flip classification. An Edge `SETUP` represents a
TradingView-virtual limit fill and may create only one ordinary broker MARKET
position per symbol across all timeframes, with the frozen GTC ATR target.
Before submission, the bridge requires the broker position to be flat, no
active managed Edge record for the symbol, and no prior submitted record for
the same `setup_id`. Edge never uses Prime/Shrek reversal-delta math and never
sweeps symbol orders through the generic Opposite Flip path.

The frozen Edge target is mandatory before any broker action. It must be finite
and positive, above entry for LONG, below entry for SHORT, and uses `GTC`.
Missing, zero, non-finite, or directionally invalid targets create no parent or
target order and cancel no existing protective order.

Blocked Edge setups place no broker order and return a publication-only,
`PENDING_ONLY` `CANCEL` with the original `setup_id`:

```text
EDGE_TARGET_REQUIRED
EDGE_ENTRY_BLOCKED_EXISTING_POSITION
EDGE_DUPLICATE_ACTIVE_SETUP
```

An unfilled setup expires at the New York RTH closing bar. Pine cancels its
virtual entry and unfilled target, publishes one `PENDING_ONLY` `CANCEL` with
reason `UNFILLED_BY_MARKET_CLOSE`, and clears it permanently. Pending setups may
survive temporary intraday HTF misalignment but never survive overnight.

An already-open Edge position is not closed at EOD. Its attached ATR target uses
`GTC`, remains active overnight, and the payload declares
`eod_policy=NO_EOD_CLOSE`. There is no Edge Pine EOD-close option or next-day
position reset.

Telegram lifecycle:

```text
🟣 Vixale Edge setup LONG / SHORT
🟣 Vixale Edge opened LONG / SHORT
🎯 Vixale Edge hit target
🛑 Vixale Edge hit Stop Loss
⚪ Vixale Edge setup canceled — Unfilled by market close
```

The purple circle identifies Vixale Edge. Direction is written explicitly. The
internal Fiona identifiers remain unchanged.

### 3.3 Elvis

**Public VECO name:** Elvis  
**System:** EMA Cross Pullback  
**Status:** Paused

Existing classification and lifecycle must remain backward compatible.

---

## 4. Canonical Production Files

### 4.1 Render / website / Telegram / Sheets service

Current confirmed production baseline after the Fiona/Shrek classification and Telegram lifecycle patch:

```text
GitHub repository: ipotrader22-cloud/tv-telegram-bot
Production branch: main
Canonical repository path: /app.js
Local clone: C:\Users\tradi\Documents\GitHub\tv-telegram-bot
SHA-256: E0D8A90787C89CE54545C6CDA58A0DD9D312005C94F73DF884EE21135A342D96
Line count: 8,160
Verified: 2026-07-26
```

Verified features in this exact snapshot:

- `FIONA_LIMIT_PULLBACK_ATR_TARGET` classification;
- `🟣 Vixale Edge opened LONG/SHORT`;
- Vixale Edge target, Stop Loss, and EOD lifecycle messages;
- `Stop Ref` in Vixale Edge and Vixale Prime opening messages;
- separate Vixale Prime opening messages preserved.

Delivery convention when a direct file artifact is needed:

- deliver production `app.js` as `.txt`;
- provide a direct download link;
- do not treat a chat artifact as canonical after the Git commit exists.

### 4.2 Local IB bridge

Current production bridge:

```text
ib_bridge.py
Source snapshot: ib_bridge(6).py
SHA-256 snapshot: bb8c7ca499312a1798c6c2b940680e07e55259e5fba7d99a28fe5a5a3cddac6a
```

The sanitized, reviewable bridge source is versioned at
`/bridge/ib_bridge.py`. Local deployment remains
`C:\ib_bridge\ib_bridge.py`. Use `/scripts/deploy-ib-bridge.ps1` to compile,
back up, copy, restart only an identifiable existing bridge process, and verify
`/ib/status`.

Known local deployment directory:

```text
C:\ib_bridge\
```

### 4.3 TradingView Pine sources

Shrek source snapshot:

```text
Shrek_1_4.pine
Strategy title: Shrek 1.4
Payload strategy ID: SHREK_1_4
Variant field: not used
```

Vixale Edge canonical source:

```text
pine/Vixale_Edge_Limit_Pullback_v1_1.pine
Strategy title: Vixale Edge 1.1
Internal strategy: VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1
Internal variant: FIONA_LIMIT_PULLBACK_ATR_TARGET
```

---

## 5. Logical Architecture

```text
┌──────────────────────────┐
│ TradingView strategy     │
│ alert() JSON payload     │
└─────────────┬────────────┘
              │ POST /tv
              ▼
┌──────────────────────────┐
│ Render app.js            │
│ - validates/classifies   │
│ - forwards to bridge     │
│ - serves website         │
│ - handles callbacks      │
└─────────────┬────────────┘
              │ POST BRIDGE_URL/tv
              ▼
┌──────────────────────────┐
│ Local FastAPI bridge     │
│ - safety checks          │
│ - TWS order placement    │
│ - fill monitoring        │
│ - forced EOD             │
└─────────────┬────────────┘
              │ IB API
              ▼
┌──────────────────────────┐
│ IBKR / TWS               │
│ source of execution truth│
└─────────────┬────────────┘
              │ confirmed callback
              ▼
┌──────────────────────────┐
│ Render app.js            │
│ - Telegram               │
│ - Google Sheets          │
│ - Dashboard              │
└──────────────────────────┘
```

---

## 6. Repository / Folder Structure

VECO is currently deployed across multiple locations rather than one fully standardized monorepo.

### 6.1 Render application repository

Canonical repository:

```text
ipotrader22-cloud/tv-telegram-bot
```

Known production layout:

```text
tv-telegram-bot/
├── AGENTS.md               # Persistent Codex operating and safety instructions
├── app.js                  # Express server, routes, Telegram, Sheets, dashboard, website
├── package.json            # Node dependencies and start command
├── docs/                   # Living project documentation
│   └── VECO_DEVELOPER_HANDBOOK.md
└── environment variables   # Configured in Render dashboard, never committed
```

Local Windows clone:

```text
C:\Users\tradi\Documents\GitHub\tv-telegram-bot
```

The complete root tree and package scripts should be refreshed here after a dedicated repository audit.

### 6.2 Local bridge

Known layout:

```text
C:\ib_bridge\
├── ib_bridge.py
├── .env
├── vixale_managed_positions.json
└── startup / PowerShell scripts
```

Known startup script:

```text
Vixale_AutoStart_v3.ps1
```

Known Windows Task Scheduler behavior:

- launches TWS;
- launches ngrok;
- launches the bridge;
- may leave visible PowerShell windows because of `-NoExit`;
- TWS may still require manual password entry after a reboot.

### 6.3 TradingView Alert Machine

FAM is separate from VECO runtime, but feeds Fiona alert creation.

Known local folder:

```text
C:\Users\tradi\Downloads\Fiona_Alert_Machine_v1.2_PF2_PythonFix\
└── fiona_alert_machine_v1_1\
    ├── Fiona_Alert_Machine.py
    ├── fiona_core.py
    ├── tv_automation.py
    ├── output\
    ├── automation_screenshots\
    ├── tv_profile\
    └── .venv\
```

`tv_profile` contains private TradingView session data and must not be uploaded publicly.

---

## 7. Configuration Locations

## 7.1 Render environment variables

Configuration lives in the Render service environment, not in source code.

Important categories:

### Telegram

```text
TELEGRAM_TOKEN
CHAT_ID
ADMIN_CHAT_ID
```

### Google Sheets

```text
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
```

### Dashboard and website

```text
DASHBOARD_KEY
SITE_BASE_URL
RESEND_API_KEY
EMAIL_FROM
PASSWORD_REQUEST_BCC
```

### Bridge forwarding and safety

```text
BRIDGE_URL
BRIDGE_FORWARD_ENABLED
BRIDGE_DRY_RUN
BRIDGE_ALLOW_MANUAL_TESTS
MAX_BRIDGE_QTY
BRIDGE_DEFAULT_QTY
BRIDGE_ALLOWED_SYMBOLS
```

Never put secrets into this handbook.

## 7.2 Local bridge `.env`

Current critical values include:

```text
IB_HOST=127.0.0.1
IB_PORT=7497
IB_CLIENT_ID=77
ENTRY_ORDER_TYPE=MARKET
ALLOW_FUTURES=false
```

Forced EOD production configuration:

```text
FORCE_EOD_FLATTEN_ENABLED=true
FORCE_EOD_FLATTEN_TIME=15:59
FORCE_EOD_FLATTEN_TIMEZONE=America/New_York
FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER=15:59
FORCE_EOD_WEEKDAYS_ONLY=true
FORCE_EOD_SCHEDULER_POLL_SECONDS=5
BLOCK_MARKET_CLOSES_OUTSIDE_RTH=false
```

Other important bridge controls:

```text
DRY_RUN
RENDER_WEBHOOK_URL
MAX_ORDER_NOTIONAL
MAX_SHARE_QTY
DEFAULT_STOCK_QTY
ALLOW_SHORTS
ORDER_CONFIRM_DELAY
PARTIAL_FILL_GRACE_SECONDS
ENABLE_EXECUTION_FILL_MONITOR
ENABLE_TARGET_FILL_MONITOR
ENABLE_MANAGED_TARGET_RECONCILE
MANAGED_POSITIONS_FILE
CANCEL_ORPHAN_TARGETS_AFTER_FLAT
ENABLE_RENDER_FLAT_RECONCILE
```

## 7.3 TradingView alert configuration

Live strategy alerts use:

```text
Condition: the strategy name
Trigger: alert() function calls only
Webhook: https://www.vixale.com/tv
Expiration: Open-ended
```

Important: TradingView alerts store a snapshot of the strategy and its settings at creation time. Changing chart settings later does not update an existing alert. The alert must be recreated.

---

## 8. Event and Payload Contract

Core payload fields:

```json
{
  "source": "TradingView",
  "strategy": "...",
  "variant": "...",
  "event": "SETUP",
  "sec_type": "STK",
  "asset_class": "STOCK",
  "symbol": "SOXL",
  "exchange": "SMART",
  "currency": "USD",
  "side": "LONG",
  "entry": 41.90,
  "price": 41.90,
  "target": 43.20,
  "target_tif": "GTC",
  "stop": 40.75,
  "qty": 100,
  "profile": "SOXL_45_FIONA_LIMIT",
  "timeframe": "45",
  "target_type": "ATR_LIMIT_OPPOSITE_FLIP",
  "stop_type": "OPPOSITE_SUPERTREND_FLIP_CLOSE",
  "eod_policy": "CLOSE_1600_ET",
  "reason": "..."
}
```

### 8.1 Event mapping

```text
SETUP / ENTRY      → SETUP
PENDING_SETUP      → PENDING_SETUP (Vixale Edge publication only)
ENTRY_FILL / FILL  → FILL
TP / TARGET        → TP
CLOSE_STOP / STOP  → SL internally
EOD_CLOSE          → EOD
CANCEL              → CANCEL
RECONCILE_FLAT      → silent reconciliation
STOP_REF_UPDATE     → silent stop-reference update
EXTERNAL_CLOSE      → broker-confirmed Vixale Edge Manual Close
```

Vixale Edge payload version 2 uses `system_id=VIXALE_EDGE` and a deterministic
`setup_id`:

```text
VIXALE_EDGE:<symbol>:<timeframe>:<LONG|SHORT>:<flip_bar_time>
```

The same ID is retained across `PENDING_SETUP`, submitted `SETUP`, confirmed
`ENTRY_FILL`, EOD `CANCEL`, and replacement cleanup. `PENDING_SETUP` and
`cancel_scope=PENDING_ONLY` are publication-only and are never forwarded to the
IB bridge. An identified `SETUP` preserves the exact Pending row until the
broker returns `ENTRY_FILL`; the fill removes that row by `setup_id` and creates
Open once. Legacy Edge alerts without `setup_id` remain supported.

For internal Shrek/Fiona processing, `CLOSE_STOP` still means the broker-confirmed
opposite SuperTrend flip close. The raw event and stored Sheets event
`FLIP_CLOSE` remain unchanged for compatibility. Telegram, website, and dashboard
render either value publicly as `Stop Loss`, including historical rows read from
old raw JSON; no historical Sheets rows are rewritten.

### 8.2 Strategy classification precedence

This ordering is critical:

1. Detect Vixale Edge using `system_id=VIXALE_EDGE`, variant
   `FIONA_LIMIT_PULLBACK_ATR_TARGET`, strategy
   `VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET_FIONA_v1`, or a supported legacy
   Fiona Limit marker.
2. Detect Vixale Prime / Shrek generic Opposite Flip.
3. Detect Elvis / EMA Pullback.
4. Detect other or older Vixale families.

**Gotcha:** Shrek and Fiona currently share a generic `strategy` identifier containing `VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET`. Fiona must be identified by its specific `variant` before the generic Shrek classifier runs.

`is_opposite_flip_payload()` explicitly returns false for Edge. This is an
execution boundary, not only a public-label distinction.

### 8.3 Vixale Edge broker-flat callback contract

The bridge classifies a managed Edge position that becomes broker-flat by
positive execution evidence:

1. Exact managed target order/execution Filled → `TP`, actual price/quantity,
   reason `IB_TARGET_EXECUTION_CONFIRMED`.
2. Exact bridge Stop Loss close execution Filled → `CLOSE_STOP`, actual
   price/quantity, reason `IB_STOP_CLOSE_EXECUTION_CONFIRMED`.
3. Neither execution is proven → `EXTERNAL_CLOSE`, public `Manual Close`,
   reason `IB_POSITION_FLAT_EXTERNAL_EXECUTION`.

A flat position, missing/non-working target, stored target price, or market
touch is not TP evidence. Broker identity uses strongest-ID precedence:

1. If the managed record has `permId`, the execution must match that exact
   `permId`; a matching `orderRef` cannot override a mismatch.
2. Otherwise, if it has `orderId`, the execution must match that exact
   `orderId`.
3. Only legacy records without either strong ID may fall back to `orderRef`.
   That fallback additionally requires exact symbol and closing action,
   sufficient quantity, an execution timestamp at or after
   `entry_filled_at`, and one unambiguous matching execution group.

Even exact target execution evidence is not sufficient for immediate TP
publication: the target monitor performs a bounded broker-position check and
must confirm zero before setting `broker_confirmed_flat=true` or calling
Render. A Filled target with a non-flat broker position sends no callback,
retains managed state, and is retried by persistent reconciliation.

The same broker-flat gate applies to every Edge `CLOSE_STOP`, whether the
market-order fill is observed immediately or by the delayed fill monitor. The
bridge must confirm the close execution and then confirm the actual IB position
is zero before it sets `broker_confirmed_flat=true` or sends `CLOSE_STOP` to
Render. A Filled close with a non-flat position is persisted as
`EDGE_STOP_CLOSE_POSITION_NOT_FLAT`, including the execution identity and
`position_after_close`; managed state remains for recovery, and neither
`CLOSE_STOP` nor `RECONCILE_FLAT` is published.

Every payload-version-2 Edge `CLOSE_STOP` uses a setup-scoped persistent close
reservation before broker activity. The incoming `setup_id` must exactly match
the active managed Edge row; a stale setup returns
`EDGE_STOP_SETUP_MISMATCH` without target cancellation or order submission. A
reservation write failure returns `EDGE_STOP_STATE_PERSISTENCE_FAILED` before
broker activity. The reservation identity is `setup_id + ":CLOSE_STOP"` and
stores a deterministic short-hash close `orderRef`, lifecycle state, target
identity, close identity, fill evidence, and position verification.

The strict Edge close sequence is:

1. Load the exact active setup and persist `RESERVED`.
2. Identify the one managed target by exact `permId`, otherwise exact
   `orderId`, otherwise unambiguous `orderRef`.
3. Persist `TARGET_CANCEL_PENDING`, cancel only that target, and poll until the
   target is proven Filled or proven Cancelled / ApiCancelled / Inactive.
4. After a partial target execution, calculate the maximum remaining quantity
   as managed target quantity minus confirmed target execution quantity, then
   poll the IB position with a bounded wait until it is on the managed side and
   no greater than that maximum.
5. If the target filled and the position is flat, submit no market close and
   let exact target reconciliation publish TP.
6. If the target partially filled and was then canceled, close only the
   final synchronized broker quantity. If the position remains stale above the
   expected maximum, submit no close, retain managed state, and return
   `EDGE_STOP_POSITION_SYNC_UNCONFIRMED`. If cancellation remains ambiguous or
   the target is still working, submit no close and return
   `EDGE_STOP_TARGET_CANCEL_UNCONFIRMED`.

The pre-cancel position quantity is never reused for Edge close sizing, and the
generic broad symbol-order cancellation path is not called. Before market
submission, the bridge persists `CLOSE_SUBMISSION_PENDING` with the
deterministic order reference, attempt number, remaining quantity, partial
target quantity, average price, and execution IDs. Repeated or concurrent
alerts observe the same reservation.

Crash-window recovery performs bounded IB refreshes for open orders/trades,
completed orders and executions when the connected client supports them, and
the current position. An exact recovered close order or execution has its
actual `permId`, `orderId`, `orderRef`, status, and fills persisted and never
causes a duplicate submission. If the broker is already flat, recovery submits
no order and leaves publication to evidence-based reconciliation. If an
authoritative refresh proves there is no matching order or execution while the
managed-side position remains open, the bridge persists a retry attempt,
polls the position through the same bounded synchronization gate used after a
partial target, and permits one controlled replacement only when the managed
side and quantity are confirmed. A stale quantity above original quantity
minus all confirmed target executions persists `POSITION_SYNC_UNCONFIRMED`,
returns `EDGE_STOP_POSITION_SYNC_UNCONFIRMED`, and submits no order. A
Rejected, Cancelled, ApiCancelled, or Inactive close is
`EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN`, not permanently in progress, and may
use that one replacement. A second replacement is prohibited across restart.
Ambiguous or non-authoritative evidence returns
`EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS`, retains managed state, and submits no
order because the position may be unprotected.

Recovery is automatic: the existing persistent managed-position reconciliation
loop scans active Edge close-reservation states on startup and every poll. It
reconstructs the original payload from the managed row, performs the same
authoritative refresh, and resumes target cancellation, position
synchronization, close adoption/replacement, flat reconciliation, or pending
Render delivery without requiring TradingView to resend `CLOSE_STOP`.

Scheduler recovery and incoming payload-version-2 Edge `CLOSE_STOP` handling
share the same close lock. After acquiring it, the scheduler reloads the
managed row and reservation and revalidates the exact `setup_id`; a setup that
changed while waiting returns `EDGE_STOP_SETUP_MISMATCH` with no broker
activity. Target cancellation, re-cancellation, initial close submission, and
replacement submission are allowed only for an eligible stock while
`BLOCK_MARKET_CLOSES_OUTSIDE_RTH` applies and the New York stock session is
currently RTH. Outside RTH, recovery returns
`EDGE_STOP_RECOVERY_DEFERRED_OUTSIDE_RTH`, leaves the GTC target and reservation
intact, and is limited to authoritative read-only refresh, execution-history
collection, broker-flat reconciliation, and retry of an already-persisted
Render publication.

Recovery states are deliberately separated:

```text
Broker action (RTH + shared lock only):
RESERVED
TARGET_CANCEL_PENDING
TARGET_CANCEL_UNCONFIRMED
TARGET_RESOLVED
CLOSE_SUBMISSION_PENDING
RECOVERY_REPLACEMENT_SUBMISSION_PENDING
EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN
POSITION_SYNC_UNCONFIRMED

Publication only (never cancel or submit):
CALLBACK_PENDING
MIXED_EXIT_EVIDENCE_INCOMPLETE
POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION
```

`CLOSE_SUBMITTED` is observation-only but not terminally stuck. Authoritative
refresh maps a Filled close plus a flat broker position to
`POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION`, and a Filled close plus a
non-flat position to `FILLED_POSITION_NOT_FLAT`, preserving every exact
execution component. Rejected, Cancelled, ApiCancelled, or Inactive plus an
open managed-side position becomes
`EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN`; replacement is deferred until a
later RTH broker-action pass. Submitted, PreSubmitted, and PendingSubmit remain
`CLOSE_SUBMITTED`. Ambiguous or non-authoritative evidence becomes
`EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS`. The read-only pass never submits the
replacement itself.

Ambiguous recovery is non-mutating until a later authoritative refresh
resolves it into a specific state.
`FILLED_POSITION_NOT_FLAT` permits a residual close only when exact executions
from the same setup prove the already-closed quantity and the broker position
equals the calculated residual; it never permits a generic replacement.
A non-flat position encountered in a publication-only state is persisted as
`EDGE_STOP_POST_CLOSE_POSITION_CONFLICT`, including its prior state and
position, and requires explicit/manual intervention. Every transition is
saved before broker activity and the persisted attempt cap is honored across
restart.

When a partial target execution is followed by the Stop Loss remainder, the
bridge publishes one final `CLOSE_STOP` for the full original managed
quantity. Its exit price is the quantity-weighted average of confirmed target
and every Stop Loss execution across all close attempts. The managed JSON
stores an append-preserving `close_attempts` list with attempt number,
`orderId`, `permId`, `orderRef`, status, cumulative filled quantity, average
price, and execution IDs. Every positive target, Stop Loss attempt, or manual
component must contain at least one real IB `execId`; `permId`, `orderId`, and
`orderRef` are not sufficient for a mixed or multi-attempt final publication.
Aggregation combines exact components from both `trade.fills` and execution
history by unique `execId`. Identical duplicates count once, overlapping ID
sets do not discard unrelated executions, and conflicting quantity or price
for the same `execId` is ambiguous. Multiple `execId` values on one trade are
valid when each has exact quantity and price and their unique quantity equals
the broker cumulative fill; evidence is incomplete only when the exact total
is lower than the cumulative total or an execution lacks required evidence.
Authoritative history also reconstructs and durably saves multi-execution
partial-target components after restart so they can participate in final
mixed-exit accounting.

The component total must equal the original quantity, the
`reconciliation_id` contains the sorted complete `execId` set, and raw JSON
retains every component. Its reason is
`IB_STOP_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED`. The existing Sheets
schema is unchanged. A partial target is not published as a separate TP. If
any component price, quantity, or exact `execId` evidence is missing, the bridge
persists `EDGE_STOP_MIXED_EXIT_EVIDENCE_INCOMPLETE`, withholds the callback,
and retains the managed row for reconciliation rather than fabricating P&L.

Every read-only recovery saves refreshed close-attempt and partial-target
execution history before advancing state or authorizing a residual. If that
managed-file save fails, recovery returns
`EDGE_STOP_STATE_PERSISTENCE_FAILED`, retains the existing managed record, and
performs no target cancellation, initial close, residual close, or replacement
close. A residual is eligible only after all exact components used to prove
its quantity have been durably saved.

If a confirmed partial target is followed by an unambiguous attributed manual
remainder, the same component accounting publishes one full-original-quantity
`EXTERNAL_CLOSE` / `Manual Close` at the weighted actual exit price. It never
publishes a partial TP. Every component must have confirmed price, quantity,
and identity; otherwise publication is withheld. Manual Close continues to
store blank result and result percentage even when all actual component prices
are available.

When one matching external execution is available after a reliably timestamped
managed entry, its actual price and quantity are published. External attribution
requires `entry_filled_at` or `entry_order.filled_at`, a parseable execution
time at or after that entry, matching symbol and closing action, and one
unambiguous execution group. Without the managed entry timestamp, or for a
pre-entry fill, the callback explicitly marks price and quantity unavailable
and never attaches a historical execution. It never substitutes the target
price. `EXTERNAL_CLOSE` always blanks result and result percentage, ignores
supplied P&L aliases, and never invokes normal close P&L fallback—even when
actual execution price and
quantity are available.

The managed-position JSON persists entry, target, and bridge-close broker
identity plus timestamps. Before Render delivery, reconciliation persists a
claim keyed by `setup_id + exit execution identity`. Failed delivery retains
the claim and managed row for an identical retry. The row is cleared only after
Render returns success.

`app.js` also treats broker-confirmed Edge `TP` and `CLOSE_STOP` as synchronous
persistent callback lifecycles. Recognition requires
`source=IB_BRIDGE`, `system_id=VIXALE_EDGE`, `setup_id`,
`reconciliation_id`, `broker_confirmed_flat=true`, a zero
`position_after_close`, and a valid broker execution identity. The HTTP route
awaits exact Open removal, one Trades exit, one Closed Trade, Telegram
publication, and raw-JSON completion markers. It returns HTTP 200 only after
all components succeed and HTTP 503 `RETRY` after a retryable Sheets or
Telegram failure.

Retries repair only missing components. The in-flight key is
`setup_id + reconciliation_id + exit event`; durable raw JSON markers make a
completed duplicate harmless after Render restart. TP remains `Take Profit`,
`CLOSE_STOP` remains publicly `Stop Loss`, actual execution price/quantity are
preserved, and neither callback is forwarded back to the bridge. No Google
Sheets columns are added.

`app.js` processes `EXTERNAL_CLOSE` synchronously as a broker callback, never
forwards it back to the bridge, removes the exact Edge Open row, stores
`Manual Close` in the existing event column, and publishes:

```text
⚪ Vixale Edge closed manually
Manual Close — price unavailable
```

The second line is used only when no actual IB execution price is available.
Persistent publication markers live inside the existing raw JSON cells, so
duplicate callbacks do not create another Trades row, Closed row, or Telegram
message. A callback without confirmed broker-flat state or valid `IB_BRIDGE`
identity cannot close the public ledger. No Google Sheets column or worksheet
schema changes.

---

## 9. Google Sheets Data Model

Google Sheets is the persistent operational ledger used by the dashboard.

### 9.1 `Trades`

Columns A:K:

```text
A Timestamp
B Symbol
C Side
D Event
E Entry
F Size
G Target or Exit
H Stop
I Result
J Status
K Raw JSON
```

Only executed events are appended:

```text
FILL, TP, SL / FLIP_CLOSE, EOD, EXTERNAL_CLOSE / Manual Close
```

### 9.2 `Pending`

Columns A:J:

```text
A Trade ID
B Timestamp
C Symbol
D Side
E Status
F Entry
G Size
H Target
I Stop
J Raw JSON
```

### 9.3 `Open Positions`

Columns A:L:

```text
A Trade ID
B Open Time
C Symbol
D Side
E Status
F Entry
G Size
H Target
I Stop
J Last Price / GoogleFinance formula
K Unrealized P&L formula
L Raw Open JSON
```

### 9.4 `Closed Trades`

Columns A:L:

```text
A Trade ID
B Open Time
C Close Time
D Symbol
E Side
F Entry
G Exit
H Size
I Result
J Event
K Raw Open JSON
L Raw Close JSON
```

### 9.5 `Positions`

Legacy sheet. Current code cleans matching legacy rows when processing modern events.

---

## 10. Dashboard and Admin Operations

### 10.1 User dashboard

Routes include:

```text
/login
/dashboard
/dashboard?key=...
```

Authorization uses:

- `DASHBOARD_KEY` query parameter; or
- `vixale_dashboard_key` cookie.

The dashboard reads from Google Sheets. TWS is the execution source of truth; Sheets is the displayed operational ledger.

The authorized public dashboard also includes a read-only Option Journal table
showing the latest 20 option records, newest first. Journal loading is isolated
so a worksheet error does not prevent the existing dashboard from rendering.

### 10.2 Operational admin surfaces

VECO does not currently have one unified admin panel. Operational administration is split across:

- Render Dashboard: deploys, logs, environment variables, instance plan;
- Google Sheets: ledger inspection and manual verification;
- TWS: broker positions and orders;
- local bridge endpoints;
- TradingView Alerts Manager;
- Telegram channel.

Important local bridge endpoints:

```text
GET  /
GET  /ib/status
GET  /ib/open-orders
GET  /ib/positions
GET  /ib/managed-positions
POST /ib/force-eod-close-now
GET  /ib/cancel-orphan-targets
POST /ib/qualify-contract
POST /tv
```

Do not expose private bridge endpoints publicly without an explicit security design.

---

## 11. Website and Global CSS Conventions

The public website and dashboard HTML/CSS currently live inside `app.js` render functions.

### 11.1 Design tokens

Primary variables include:

```css
--bg: #fbfcfb;
--paper: #ffffff;
--paper-soft: #f4f7f4;
--ink: #101413;
--muted: #68736f;
--muted-2: #8b9691;
--line: #e3e9e5;
--line-2: #d7e1db;
--green: #0bcf74;
--green-dark: #078f51;
--green-soft: #e9fff4;
```

### 11.2 Typography

Current family:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Arial, sans-serif
```

Global convention:

```css
b, strong { font-weight: 500; }
```

The visual style intentionally avoids heavy bold typography.

### 11.3 Component conventions

Reusable visual patterns:

- `.btn`, `.btn-primary`, `.btn-green`
- `.badge`, `.dot`
- `.card`
- `.strategy-form-box`, `.strategy-form`
- `.access`
- `.partner-box`
- `.reason-box`
- `.positive`, `.negative`

Before changing website layout or styling, preserve both English and Russian render flows.

---

## 12. Reusable Code Modules and Helpers

### 12.1 `app.js`

Important logical modules:

- environment parsing: `envFlag`, `envNumber`, `envSymbolSet`;
- normalization: `normalizeSymbol`, `normalizeTradeId`, `makeTradeId`;
- system classification functions;
- TradingView text and JSON parsers;
- Telegram formatter;
- Google Sheets CRUD and ledger processing;
- dashboard data parsing and rendering;
- website HTML render functions;
- password email functions;
- bridge-forwarding and execution-first callback handling.

Classification functions are architecture-sensitive. New systems should receive one explicit classifier and one explicit public label.

### 12.2 `ib_bridge.py`

Important logical modules:

- environment and safety controls;
- contract qualification;
- order submission and attached targets;
- reversal delta math;
- fill and rejection detection;
- partial-fill target repair;
- entry and close fill monitors;
- managed position persistence;
- evidence-based Edge TP / Stop Loss / external-close reconciliation and deduplication;
- orphan target cleanup;
- forced EOD scheduler;
- Render callbacks.

Bridge callbacks are constructed from copies of the original TradingView payload. This preserves strategy metadata, including `variant`, `strategy`, `profile`, `stop`, and `target`.

---

## 13. Known Gotchas

### 13.1 Shared strategy identifier

Shrek and Fiona share a generic Opposite Flip strategy identifier. Always classify Fiona by `variant` first.

### 13.2 TradingView alert snapshots

Changing strategy settings on the chart does not alter existing alerts. Recreate the alert.

### 13.3 TradingView quantity

The Pine scripts derive quantity from TradingView Strategy Properties. FAM currently does not manage the Properties tab, so defaults such as `2% of equity` remain unless the Pine default or FAM is changed.

### 13.4 Date Range and FAM

FAM can set `Use Date Range` from NT8/XLSX inputs. Manual “Save as default” settings can be overwritten by FAM automation.

### 13.5 NT8 `Break at EOD`

For Fiona optimization and parity testing:

```text
Trading hours: US Equities RTH
Break at EOD: True
Exit on session close: True
ExitOnSessionCloseSeconds: 300
```

Without `Break at EOD=True`, 45-minute and 60-minute bars can be aligned differently from TradingView, creating false optimization results.

### 13.6 Bar timestamps

TradingView normally labels intraday bars by bar start time. NinjaTrader often displays bar end time. Example:

```text
TV 10:15 on 45m ≈ NT8 11:00
```

Do not compare timestamps without adjusting for this convention.

### 13.7 Historical limit fills

Limit entry and target can both fall inside one higher-timeframe bar. Standard fill resolution can be optimistic. Finalists should be validated with a more precise execution model.

### 13.8 Forced EOD

Shrek Pine no longer owns forced EOD execution. The local bridge is the sole
execution authority and starts its Shrek-only watchdog at 15:59
`America/New_York`.

The watchdog:

- selects only managed rows whose strategy is `SHREK` or `SHREK_1_4`;
- never closes Fiona, Elvis, manual, or other positions;
- cancels attached targets and verifies cancellation before flattening;
- treats a target fill during cancellation as a race-safe flat result;
- submits the opposite-side DAY market order for the remaining quantity;
- persists one idempotency key per date, symbol, and strategy;
- verifies the TWS fill and zero position before callback publication;
- retries verification and failed callback delivery during the remaining
  regular session without duplicating the close order;
- logs a critical error if the broker position remains open.

`app.js` has no independent EOD order timer. It publishes Telegram, Sheets, and
dashboard state only from a broker-confirmed EOD callback. Duplicate callbacks
are rejected in memory, and the ledger rejects a close with no matching open
position.

`Break at EOD` and `Exit on session close` are separate concepts:

- `Break at EOD` controls bar construction;
- `Exit on session close` controls position closure.

### 13.9 Target fill deduplication

The in-memory target monitor and persistent managed-position reconciliation can detect the same target fill. `_target_report_claims` prevents duplicate reporting.

For Vixale Edge, `_target_report_claims` is only the concurrent guard. The
durable source is the managed-position reconciliation claim containing the
fixed callback payload and `setup_id + exit execution identity`. Render failure
must retain that record for retry.

### 13.10 Orphan targets

After a confirmed flat position, leftover `TVFVG_*_TP` orders must be canceled to prevent accidental reverse entries.

### 13.11 Render Free limits

Free Render services can sleep and share a limited monthly pool of instance hours. VECO production should use:

```text
Workspace: Hobby
Vixale web service: Starter paid instance
```

A Pro workspace is not required for the current single-owner architecture.

### 13.12 Render outages and missed signals

A TradingView webhook that receives HTTP 503 may be retried, but a signal can still be lost. Do not manually backfill a missed live signal without an explicit decision.

### 13.13 Execution order during reversals

For Opposite Flip strategies, the bridge calculates a broker position delta rather than blindly submitting the desired final quantity.

Example:

```text
Current: LONG 100
Desired: SHORT 100
Correct order: SELL 200
Final position: SHORT 100
```

The attached target quantity covers only the final desired position, not the reversal delta.

---

## 14. Deployment Procedures

### 14.1 Git and Render deployment workflow

Default workflow for architectural or production changes:

1. Pull/fetch the latest `main`.
2. Read `/docs/VECO_DEVELOPER_HANDBOOK.md`.
3. Confirm the current production file hash and Git status.
4. Create a narrowly named feature branch.
5. Make the smallest surgical code change.
6. Update the handbook in the same branch when required.
7. Run syntax/tests, including:

```bash
node --check app.js
```

8. Review the complete diff.
9. Present the files changed, test results, rollback plan, and `Handbook update required: YES / NO`.
10. Obtain explicit approval before commit/push when the change affects production behavior.
11. Commit code and handbook together.
12. Push the feature branch.
13. Merge to `main` only after approval.
14. Confirm whether Render Auto-Deploy is enabled for `main`; do not assume it.
15. Confirm the Render service reaches `Live` and inspect startup logs.
16. Verify the complete VECO path with a controlled or natural signal.

Emergency direct-to-`main` changes are allowed only with explicit owner approval and a documented rollback commit.

When a manual artifact is required, deliver the complete `app.js` as `app.js.txt`, but the committed Git version becomes canonical after merge.

### 14.2 Codex default operating workflow

Repository-root instructions live in:

```text
/AGENTS.md
```

Codex must read both `AGENTS.md` and `/docs/VECO_DEVELOPER_HANDBOOK.md` before production work.

Default normal-task behavior:

```text
sync clean main
→ create feature branch
→ make surgical change
→ update handbook when required
→ run checks
→ review diff
→ commit
→ push feature branch
→ create Pull Request
→ stop before merge
```

To reduce unnecessary user steps, Codex may commit, push the feature branch, and create the Pull Request in the same task after successful checks. GitHub/OS permission dialogs may still require **Allow once**.

Codex must not:

- push directly to `main`;
- merge into `main`;
- trigger production deployment;
- use a Render Deploy Hook;

unless the user explicitly approves that exact action.

A merge into `main` remains the production approval gate because it may trigger Render Auto-Deploy.

### 14.3 Local bridge deployment

1. Back up current `ib_bridge.py`.
2. Replace the complete file.
3. Preserve `.env`.
4. Restart bridge.
5. Verify:

```text
/ib/status → connected: true
```

6. Check managed positions and open orders.
7. Test only after TWS and ngrok are confirmed online.

### 14.4 TradingView strategy deployment

1. Confirm the exact Pine source version.
2. Add/update the strategy on the intended symbol and timeframe.
3. Confirm inputs and Strategy Properties.
4. Create alert using `alert() function calls only`.
5. Confirm webhook and custom alert name.
6. Remember that edits require alert recreation.

---

## 15. Production Verification Checklist

For every strategy lifecycle change, verify:

### Entry

```text
TradingView alert delivered
Render receives SETUP
Bridge receives SETUP
Edge target is finite, positive, directionally valid, and GTC
invalid Edge target returns PENDING_ONLY / EDGE_TARGET_REQUIRED with no IB order
TWS entry fills
TWS target is attached and working
Bridge callback reaches Render
Telegram OPEN is correct
Open Positions row is correct
Dashboard system label is correct
```

### Target

```text
TWS target fills
bridge verifies the broker position is zero
Bridge detects or reconciles fill
Render synchronously completes Open removal, Trades, Closed Trades, and Telegram
retryable publication failure returns HTTP 503 RETRY
Telegram target message is correct
Open Positions row is removed
Closed Trades row is added once
completed duplicate remains ignored after Render restart
No orphan target remains
```

### Manual / external close

```text
IB position is confirmed flat
managed target execution is not falsely inferred
exact bridge Stop Loss execution is not falsely inferred
Render receives EXTERNAL_CLOSE with reconciliation_id
Telegram says Vixale Edge closed manually once
Open Positions exact setup is removed
Closed Trades says Manual Close
unknown price shows price unavailable and no P&L
known execution price/quantity are preserved without P&L or percentage
unconfirmed or non-bridge callback leaves the public ledger open
```

### Opposite flip close

```text
Close is broker-confirmed
Telegram says Vixale Prime / Vixale Edge hit Stop Loss
Sheets event remains FLIP_CLOSE
Dashboard renders FLIP_CLOSE / CLOSE_STOP as Stop Loss
Position is flat or correctly reversed
New opposite target quantity is correct
```

### Vixale Edge Stop Loss

```text
payload-version-2 setup_id exactly matches the managed setup
close reservation is durable before target cancellation
only the exact managed target is canceled and cancellation is verified
target fill during cancellation submits no market close and later publishes TP
partial target fill sizes the close from the re-read remaining IB position
partial target position polling rejects a stale quantity above expected remaining
unconfirmed partial-fill position sync returns EDGE_STOP_POSITION_SYNC_UNCONFIRMED with no market order
partial target execution quantity, price, IDs, expected remaining, and confirmed remaining are persisted
unconfirmed target cancellation returns EDGE_STOP_TARGET_CANCEL_UNCONFIRMED
stale setup returns EDGE_STOP_SETUP_MISMATCH with no broker activity
concurrent/restarted duplicate recovers the stored close and submits no second order
CLOSE_SUBMISSION_PENDING recovery refreshes open/completed orders, executions, and position
the managed reconciliation scheduler resumes active reservations without another alert
webhook and scheduler recovery serialize on the same setup-scoped close lock
the scheduler reloads setup state inside the lock and rejects a stale setup
outside RTH scheduler recovery cancels no target and submits no close/replacement
outside RTH authoritative read-only refresh may still reconcile and publish an already-filled close
publication-only recovery states perform zero broker mutation
publication-only state plus non-flat position persists EDGE_STOP_POST_CLOSE_POSITION_CONFLICT
authoritative no-order recovery permits only one persisted replacement attempt
Rejected/Cancelled/ApiCancelled/Inactive close is retryable, not permanently in progress
ambiguous recovery returns EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS with no new order
every replacement re-polls position and rejects a stale quantity above expected remaining
Edge close execution is confirmed Filled
bridge verifies the actual IB position is zero with a bounded wait
only then Render receives CLOSE_STOP with broker_confirmed_flat=true
partial target plus Stop Loss produces one full-quantity weighted CLOSE_STOP
all stop attempts remain in close_attempts and are execution-ID deduplicated
every positive mixed/multi-attempt component has a real IB execId
duplicate execIds count once and conflicting duplicate quantity/price withholds publication
reconciliation_id contains the sorted complete execId set
mixed raw JSON contains target and every Stop Loss execution ID, price, and quantity
partial target plus confirmed manual remainder produces one full-quantity Manual Close
Manual Close keeps result and result percentage blank
incomplete mixed evidence withholds publication and retains managed state
partial target creates no standalone TP row
Render awaits Trades, Closed Trades, Open removal, and Telegram publication
retryable Sheets or Telegram failure returns HTTP 503 RETRY
completed callback duplicates remain ignored after Render restart
Filled but non-flat returns EDGE_STOP_CLOSE_POSITION_NOT_FLAT
non-flat state retains managed execution identity and position_after_close
no CLOSE_STOP or RECONCILE_FLAT is published while non-flat
Prime reversal and EOD behavior remain unchanged
```

### EOD

```text
Bridge Shrek watchdog runs at 15:59 ET
Targets are canceled safely
Positions become flat
Render receives confirmed close
Dashboard and Sheets clear open rows
No duplicate Pine close is published later
```

---

## 16. Change Management Policy

Each architectural patch should include:

```text
1. Problem statement
2. Current behavior
3. Desired behavior
4. Files touched
5. Payload/schema impact
6. Backward compatibility impact
7. Deployment steps
8. Verification plan
9. Rollback plan
10. Handbook update
```

Do not combine unrelated changes in one production patch.

---

## 17. Architecture Decision Log

### ADR-001 — Execution-first publication

**Decision:** No public OPEN or CLOSED state without broker confirmation.  
**Reason:** Prevent false positions and false results when orders are rejected, delayed, or unfilled.

### ADR-002 — Broker-side Shrek 15:59 EOD flatten

**Decision:** The local IB bridge is the sole forced-EOD execution authority
for managed `SHREK` / `SHREK_1_4` positions and begins flattening at 15:59
`America/New_York`. It verifies target cancellation, broker fill, and a zero
position before sending one idempotent callback to Render. `app.js` does not
independently submit an EOD close.
**Reason:** TradingView bar timing cannot guarantee a final-session close, while
parallel Pine and server timers could submit duplicate broker orders. TWS
remains the execution source of truth.

### ADR-003 — Fiona is a separate VECO system

**Decision:** `FIONA_LIMIT_PULLBACK_ATR_TARGET` is publicly labeled Vixale Edge across Telegram, website, dashboard, and Sheets-derived system labels. The internal Fiona identity remains unchanged.
**Reason:** It is a distinct trading model and basket from the internal Shrek / Vixale Prime system.

### ADR-004 — Shrek remains the reclaim system

**Decision:** Shrek, `SHREK`, `SHREK_1_4`, `FIONA_PULLBACK_HTF_ATR_TARGET`, and supported legacy Opposite-Flip identifiers remain the reclaim system internally and render publicly as Vixale Prime.
**Reason:** Preserve internal ecosystem compatibility while using the current public Vixale naming.

### ADR-005 — Variant-first classification

**Decision:** Internal Fiona Limit classification must run before generic Opposite Flip / Shrek classification; public renaming does not alter that precedence.
**Reason:** Both Pine scripts share a generic strategy identifier.

### ADR-006 — Paid Render instance, Hobby workspace

**Decision:** Keep the workspace on Hobby and run the Vixale web service on the paid Starter instance.  
**Reason:** Prevent sleep and free-hour exhaustion without paying for unnecessary team features.

### ADR-007 — NT8 Break at EOD required

**Decision:** All Fiona NT8 tests use `Break at EOD=True`.  
**Reason:** Required for TradingView bar alignment and valid optimization results.

### ADR-008 — Git-hosted living developer handbook

**Decision:** `/docs/VECO_DEVELOPER_HANDBOOK.md` in `ipotrader22-cloud/tv-telegram-bot` is the canonical project memory. Architectural changes update the handbook in the same branch and commit as the related code.  
**Reason:** Chat history and temporary downloaded artifacts are not reliable long-term sources of truth.

### ADR-009 — Approval-gated production deployment

**Decision:** Normal production changes use a feature branch, diff review, explicit approval, then merge to `main`.  
**Reason:** A push to the production branch may trigger Render deployment and therefore must not happen implicitly.

### ADR-010 — Repository-root Codex instructions

**Decision:** `/AGENTS.md` is the persistent operating policy for Codex in this repository. Codex may create a feature branch, edit, test, commit, push the feature branch, and create a Pull Request in one task, but it must stop before merge.  
**Reason:** This preserves a safe production gate while removing repetitive manual file downloads and Git steps.

### ADR-011 — Public Vixale system names and Stop Loss terminology

**Decision:** Public surfaces render internal Shrek identities as `Vixale Prime`,
internal Fiona identities as `Vixale Edge`, and `CLOSE_STOP`, `FLIP_CLOSE`, or
equivalent opposite-flip descriptions as `Stop Loss`. Internal strategy IDs,
classification, raw events, Sheets values, payload contracts, and execution
behavior remain unchanged. Historical records are mapped when rendered rather
than rewritten.
**Reason:** Present consistent customer-facing product names and exit terminology
without changing the backward-compatible VECO execution contract.

### ADR-012 — Vixale Edge session-bound pending and overnight-open policy

**Decision:** Vixale Edge v1.1 creates pending setups only from confirmed RTH
flips before the closing bar. A pending setup has a stable `setup_id`, may pause
for intraday HTF misalignment, and expires visibly at the RTH close through a
publication-only `PENDING_ONLY` cancellation. Filled Edge positions are never
closed at EOD; their ATR targets remain GTC overnight. `app.js` publishes
Pending state before execution and Open state only after broker-confirmed
`ENTRY_FILL`.
**Reason:** Keep unfilled intent session-bounded while preserving the strategy's
overnight-position design and execution-first public ledger.

**Deployment dependency:** This Part 2 source and server support must not be
activated in TradingView until the unfinished Part 3 migration is completed and
approved. This branch does not deploy or activate alerts.

### ADR-013 — Vixale Edge bridge isolation and evidence-based flat reconciliation

**Decision:** Vixale Edge is classified before generic Opposite Flip execution.
It may hold one managed position per symbol across timeframes, enters with an
ordinary MARKET order only when a finite, directionally valid frozen GTC target
is present, and never performs broker reversal-delta or stacking. Invalid
targets return `PENDING_ONLY / EDGE_TARGET_REQUIRED` before broker activity. A
later flat state is TP only with exact managed target execution evidence plus a
confirmed zero broker position, Stop Loss only with exact bridge-close
execution evidence followed by a bounded confirmed-zero position check, and
otherwise `EXTERNAL_CLOSE` / `Manual Close`. A Filled Edge Stop Loss that is
still non-flat persists `EDGE_STOP_CLOSE_POSITION_NOT_FLAT` and its execution
identity for recovery, and publishes neither `CLOSE_STOP` nor
`RECONCILE_FLAT`.

Payload-version-2 Stop Loss handling requires an exact active `setup_id` and a
durable setup-scoped close reservation before broker activity. It cancels and
verifies only the exact managed target, re-reads the broker position after the
target reaches a proven terminal state, and sizes any market close from that
current quantity. A partial target requires bounded position synchronization
at or below original quantity minus confirmed target executions; otherwise it
returns `EDGE_STOP_POSITION_SYNC_UNCONFIRMED` without a close order. A target
fill during cancellation produces no Stop Loss order; an ambiguous cancellation returns
`EDGE_STOP_TARGET_CANCEL_UNCONFIRMED`; a stale setup returns
`EDGE_STOP_SETUP_MISMATCH`. The deterministic setup-hash close `orderRef` and
reservation state prevent concurrent and post-restart duplicate orders.

An existing `CLOSE_SUBMISSION_PENDING` reservation is recovered through
bounded authoritative refresh of open orders/trades, supported completed-order
and execution history, and position. Exact order or execution evidence is
adopted without resubmission. Authoritative proof of an open managed position
and no matching close permits one persisted replacement attempt only after the
bounded position gate confirms the managed side and a quantity no greater than
original quantity minus confirmed target executions; stale position data
returns `EDGE_STOP_POSITION_SYNC_UNCONFIRMED` with no order. A rejected or
canceled close follows the same capped recovery. Ambiguity returns
`EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS` with no order. Flat recovery submits
nothing and defers to execution-evidence reconciliation.

The existing managed-position reconciliation scheduler performs this recovery
automatically after bridge restart and on every poll for active close
reservation states. It does not require a repeated TradingView alert. It
shares the webhook close lock, reloads and revalidates the exact setup inside
that lock, persists each transition before broker activity, adopts an already
accepted order, and honors the attempt cap. All scheduler target cancellation
and close/replacement submission is RTH-only and requires the configured stock
market-close block policy. Outside RTH it returns
`EDGE_STOP_RECOVERY_DEFERRED_OUTSIDE_RTH`, preserves the GTC target, and permits
only authoritative read-only refresh, flat reconciliation, and Render
publication retry.

Broker-action and publication-only recovery states are separate.
`CALLBACK_PENDING`, `MIXED_EXIT_EVIDENCE_INCOMPLETE`, and
`POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION` never cancel or submit orders.
A non-flat broker position in one of those states becomes
`EDGE_STOP_POST_CLOSE_POSITION_CONFLICT` and requires explicit/manual
intervention. Ambiguous recovery remains non-mutating until authoritative
evidence resolves a specific state. `FILLED_POSITION_NOT_FLAT` can close only
an exact, execution-proven residual from the same setup.

Observation-only `CLOSE_SUBMITTED` is resolved by authoritative terminal
broker state. Filled plus flat advances to
`POSITION_FLAT_RECOVERY_PENDING_RECONCILIATION`; Filled plus non-flat advances
to `FILLED_POSITION_NOT_FLAT`; Rejected, Cancelled, ApiCancelled, or Inactive
plus an open managed-side position advances to
`EDGE_STOP_CLOSE_REJECTED_POSITION_OPEN`; working Submitted, PreSubmitted, or
PendingSubmit remains in progress. Ambiguous or non-authoritative evidence is
persisted as `EDGE_STOP_CLOSE_RECOVERY_AMBIGUOUS`. None of these read-only
transitions submits a broker order in the same pass.

A partial target followed by Stop Loss is one public `CLOSE_STOP` for the full
original quantity at the confirmed execution-weighted exit price. Every close
attempt is retained in managed JSON as `close_attempts`; reconciliation
aggregates confirmed fills across all attempts by real IB `execId`. Every
positive target, Stop Loss, or manual component requires an `execId`;
order-level identity alone is insufficient. Exact components are combined
from `trade.fills` and execution history. Identical duplicates count once,
overlapping ID sets retain their non-overlapping executions, and a conflicting
duplicate ID is ambiguous. A trade with multiple `execId` values is complete
when every execution has exact quantity and price and their unique total
equals broker cumulative filled quantity. Multi-execution partial-target
components are reconstructed and persisted from authoritative history after
restart. The unique component quantity must equal the original position, the
reconciliation identity contains the sorted complete `execId` set, and raw
JSON retains all components with reason
`IB_STOP_CLOSE_WITH_PARTIAL_TARGET_EXECUTION_CONFIRMED`. Incomplete component
evidence is persisted and retried, never published as a remainder-only close
or separate partial TP.

Read-only recovery treats refreshed execution-history persistence as a hard
precondition. A failed managed-file save returns
`EDGE_STOP_STATE_PERSISTENCE_FAILED` and authorizes no broker mutation or state
advance. In particular, a proven residual cannot be submitted until the exact
components proving that residual are durably saved.

When the remainder is an unambiguous post-entry manual execution, confirmed
target and manual components instead produce one full-quantity
`EXTERNAL_CLOSE` / `Manual Close` at their weighted actual price. Incomplete
component evidence is withheld, and Manual Close result/result percentage
remain blank.

Broker-confirmed Edge TP and `CLOSE_STOP` callbacks use synchronous persistent
Render publication keyed by `setup_id + reconciliation_id + event`. HTTP 200
means exact Open removal, one Trades row, one Closed Trades row, Telegram, and
raw-JSON completion markers all succeeded; retryable failures return HTTP 503
and repair only missing components. Broker evidence prefers exact `permId`,
then exact `orderId`;
legacy `orderRef` alone requires post-entry timestamped, quantity-complete,
unambiguous evidence. External Manual Close price/quantity attribution also
requires a reliable managed entry timestamp and a parseable, post-entry
execution timestamp; without those timestamps it remains unavailable. Manual
Close retains actual price/quantity when available but never calculates
fallback P&L. The managed file persists order/execution identity and a stable
reconciliation claim until Render confirms publication.

**Reason:** The shared Fiona/Prime strategy text previously allowed Edge to
enter Prime reversal handling, while flat-position reconciliation could
fabricate a TP at the stored target without broker evidence. Explicit family
isolation and durable execution identity keep TWS as the source of truth.

**Schema impact:** None. Bridge identity remains in the managed-position JSON;
Render component and completion markers remain in existing raw JSON cells.

**Activation dependency:** This is Part 3A only. The queued 16:00 Vixale Edge
Stop Loss remains Part 3B and is not implemented here. Vixale Edge 1.1
TradingView alerts must remain inactive until Part 3B is completed, reviewed,
and explicitly approved. Existing Fiona alerts are not removed by Part 3A.

---

## 18. Open Documentation Items

The following should be added when next inspected:

- exact Render repository folder tree;
- exact `package.json` scripts and dependencies;
- full list of public and private Express routes;
- dashboard HTML structure and CSS separated from landing-page CSS;
- exact Render Auto-Deploy configuration and watched branch;
- backup and rollback locations;
- exact Google Sheet document ownership and permissions model;
- whether strategy/system should become an explicit Sheet column rather than derived from raw JSON;
- unified admin panel requirements, if one is built later.

---

## 19. Owner Option Trading Journal

The website provides an owner-only manual option journal for personal
recordkeeping. It uses `ADMIN_DASHBOARD_KEY`, private no-store headers, POST for
all mutations, same-origin validation, and immutable UUID record identifiers.

Routes:

```text
GET  /admin/options/new
GET  /admin/options
POST /admin/options
GET  /admin/options/:id/edit
POST /admin/options/:id
POST /admin/options/:id/delete
```

The owner-only `GET /admin/live` page includes an Option Journal preview below
the existing Live Dashboard sections. It shows the latest 20 option records,
newest first, without filters, and links to the existing create, full-journal,
edit, and POST delete routes. Full filtering remains available only on
`GET /admin/options`.

Legs are formatted for display only. Stored values remain unchanged. The
journal tables split display text on line breaks, `/`, semicolons, commas, and
repeated `Long` or `Short` markers; each resulting leg is HTML-escaped and
rendered on its own compact line. The entry form recommends entering one leg
per line for the clearest display.

The feature automatically creates an isolated `Option Journal` worksheet when
absent and writes user values in `RAW` mode. Columns A:S are:

```text
ID, Trade Date, Entry Time, Symbol, Strategy, Legs, Expiration, Contracts,
Multiplier, Trade Type, Entry Price, Exit Date, Exit Time, Exit Price, Fees,
Status, Notes, Created At, Updated At
```

P&L is derived only for closed records and is never entered manually:

```text
Credit: (entry price - exit price) × contracts × multiplier - fees
Debit:  (exit price - entry price) × contracts × multiplier - fees
```

This feature is recordkeeping only. It does not call the IB bridge, TradingView
handlers, Telegram helpers, VECO lifecycle code, or broker execution. It does
not read from or write to `Trades`, `Pending`, `Open Positions`,
`Closed Trades`, or legacy `Positions`.

The authorized public `GET /dashboard` view displays only Trade Date, Symbol,
Strategy, Legs, Expiration, Contracts, Credit/Debit, Entry Price, Exit Price,
Status, and derived P&L. It shows the latest 20 records, newest first, without
filters. It never renders Notes, edit/delete controls, create buttons, internal
IDs, Created At, Updated At, owner-authentication details, worksheet
credentials, or internal errors.

Owner mutation surfaces remain protected by `ADMIN_DASHBOARD_KEY`. Option
Journal records are not published through public APIs, Telegram, or VECO
execution-backed Sheets. Journal read failures on either dashboard are caught
and logged server-side without exposing internal details; existing dashboard
content continues rendering with a restrained warning only in the journal
section.

Rollback: revert the applicable dashboard journal commit and redeploy the prior
confirmed commit. Reverting the public-dashboard patch removes only the public
read-only table; owner journal pages and the owner Live Dashboard preview remain
available. Rollback does not change saved records or the worksheet schema. The
isolated worksheet may remain as inert historical data; deleting it requires
separate explicit approval.

---

## 20. Handbook Update Protocol

When a future change is made:

1. Read `/AGENTS.md` and `/docs/VECO_DEVELOPER_HANDBOOK.md` before editing code.
2. Confirm the latest production source files, branch, Git status, and relevant hashes.
3. State `Handbook update required: YES / NO`.
4. Make the smallest safe patch on a feature branch unless an explicitly approved emergency requires otherwise.
5. Update the affected handbook sections in the same branch.
6. Add or amend an ADR when the change is architectural.
7. Update source snapshot/version/hash information when the canonical production baseline changes.
8. Review the code and handbook diff together.
9. Commit code and handbook together.
10. Push and merge only after explicit approval for production-impacting changes.
11. Verify Render and the complete VECO lifecycle after deployment.

A handbook is not considered implemented until it is committed at its canonical Git path. Temporary chat/download copies are not canonical.
