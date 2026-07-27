# VECO Developer Handbook

**Project:** Vixale Ecosystem (VECO)  
**Status:** Living canonical reference  
**Last updated:** 2026-07-27
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

### 3.1 Shrek

**Public VECO name:** Shrek  
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
→ close on target, opposite SuperTrend flip, or EOD
```

Telegram lifecycle:

```text
🟢 / 🔴 Shrek opened LONG / SHORT
🎯 Shrek hit target
🔁 Shrek closed LONG / SHORT
⏰ Shrek EOD close
```

Opening Telegram messages include:

- Entry
- Target
- Stop Ref
- Quantity

### 3.1.1 Shrek 1.4 naming contract

TradingView and VECO use one canonical strategy identity:

```text
Visible TradingView title: Shrek 1.4
Payload strategy ID: SHREK_1_4
```

The Pine payload does not send a `variant` field. Render and the local bridge recognize
`SHREK_1_4` directly. Legacy Shrek/Opposite-Flip identifiers remain accepted only so
already-created old alerts can be retired safely.

### 3.2 Fiona

**Public VECO name:** Fiona  
**TradingView strategy:** `VX_FIONA_LIMIT_PULLBACK_LIVE_v1.0`  
**Internal variant:** `FIONA_LIMIT_PULLBACK_ATR_TARGET`

Logic:

```text
SuperTrend flip
→ freeze Flip Close or Broken STL anchor
→ freeze ATR(14)
→ place resting TradingView limit order
→ on TradingView historical/live limit fill, send SETUP
→ bridge executes TWS MARKET entry
→ attach frozen ATR target
→ close on target, opposite SuperTrend flip, or EOD
```

Telegram lifecycle:

```text
🟣 Fiona opened LONG / SHORT
🎯 Fiona hit target
🔁 Fiona closed LONG / SHORT
⏰ Fiona EOD close
```

The purple circle identifies the Fiona system. Direction is written explicitly.

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
- `🟣 Fiona opened LONG/SHORT`;
- Fiona target, regular close, and EOD lifecycle messages;
- `Stop Ref` in Fiona and Shrek opening messages;
- separate Shrek opening messages preserved.

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

Fiona source snapshot:

```text
VX_FIONA_LIMIT_PULLBACK_LIVE_v1.0
SHA-256: 8a3f04a73aff56d12acf59ccc302f7c13cd38e42a2eea94fd9d28b4d38c93a32
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
FORCE_EOD_FLATTEN_TIME=15:55
FORCE_EOD_FLATTEN_TIMEZONE=America/New_York
FORCE_EOD_BLOCK_NEW_STOCK_ENTRIES_AFTER=15:55
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
ENTRY_FILL / FILL  → FILL
TP / TARGET        → TP
CLOSE_STOP / STOP  → SL internally
EOD_CLOSE          → EOD
CANCEL              → CANCEL
RECONCILE_FLAT      → silent reconciliation
STOP_REF_UPDATE     → silent stop-reference update
```

For Shrek/Fiona, `CLOSE_STOP` means an opposite SuperTrend flip close, not a conventional hard stop loss. Sheets/dashboard display this as `FLIP_CLOSE`.

### 8.2 Strategy classification precedence

This ordering is critical:

1. Detect Fiona Limit using the specific variant `FIONA_LIMIT_PULLBACK_ATR_TARGET`.
2. Detect Shrek / generic Opposite Flip.
3. Detect Elvis / EMA Pullback.
4. Detect older Vixale intraday families.

**Gotcha:** Shrek and Fiona currently share a generic `strategy` identifier containing `VX_ST_OPPOSITE_FLIP_ALWAYS_IN_MARKET`. Fiona must be identified by its specific `variant` before the generic Shrek classifier runs.

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
FILL, TP, SL / FLIP_CLOSE, EOD
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
- target reconciliation and deduplication;
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

Pine EOD alerts are not the only safety layer. The bridge independently flattens managed positions at 15:55 ET.

`Break at EOD` and `Exit on session close` are separate concepts:

- `Break at EOD` controls bar construction;
- `Exit on session close` controls position closure.

### 13.9 Target fill deduplication

The in-memory target monitor and persistent managed-position reconciliation can detect the same target fill. `_target_report_claims` prevents duplicate reporting.

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
Bridge detects or reconciles fill
Telegram target message is correct
Open Positions row is removed
Closed Trades row is added once
No orphan target remains
```

### Opposite flip close

```text
Close is broker-confirmed
Telegram says closed, not conventional stop loss
Sheets event is FLIP_CLOSE
Position is flat or correctly reversed
New opposite target quantity is correct
```

### EOD

```text
Bridge forced EOD runs at 15:55 ET
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

### ADR-002 — Bridge-managed forced EOD

**Decision:** The local bridge independently flattens managed stock positions at 15:55 ET.  
**Reason:** TradingView timeframe-dependent EOD alerts are not reliable enough as the only safety layer.

### ADR-003 — Fiona is a separate VECO system

**Decision:** `FIONA_LIMIT_PULLBACK_ATR_TARGET` is publicly labeled Fiona across Telegram, dashboard, and Sheets-derived system labels.  
**Reason:** It is a distinct trading model and basket from Shrek.

### ADR-004 — Shrek remains the reclaim system

**Decision:** `FIONA_PULLBACK_HTF_ATR_TARGET` continues to appear publicly as Shrek.  
**Reason:** Existing live ecosystem continuity and established public naming.

### ADR-005 — Variant-first classification

**Decision:** Fiona Limit classification must run before generic Opposite Flip / Shrek classification.  
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
