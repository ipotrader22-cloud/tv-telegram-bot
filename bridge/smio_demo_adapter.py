"""Experimental demo lifecycle on the existing core IB connection.

All broker mutations use the core lock. No foreign-symbol cancellation, quantity
fallback, reversal math, target recalculation, or independent broker connection.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import time
import math
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from decimal import Decimal

try:
    from .smio_demo_contract import CONTRACT, validate
    from .smio_rsi_gate import is_smio_rsi_payload
except ImportError:
    from smio_demo_contract import CONTRACT, validate
    from smio_rsi_gate import is_smio_rsi_payload


try:
    from .smio_stale_entry_guard import stale_smio_entry_callback
except ImportError:
    from smio_stale_entry_guard import stale_smio_entry_callback

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def callback_key(core):
    return parse_qs(urlparse(core.render_quote_update_url()).query).get("key", [""])[0].strip()


def send_callback(core, payload):
    key = callback_key(core)
    if not key or not core.RENDER_WEBHOOK_URL:
        return {"forwarded": False, "reason": "SMIO callback authentication unavailable"}
    try:
        response = core.requests.post(core.RENDER_WEBHOOK_URL, json=payload, timeout=10,
                                      headers={"X-Vixale-Quote-Key": key})
        return {"forwarded": True, "status_code": response.status_code, "response": response.text[:500]}
    except Exception:
        # Never include the authenticated URL or request headers in logs/outbox.
        return {"forwarded": False, "reason": "SMIO authenticated callback transport failed"}


class DemoLifecycle:
    def __init__(self, core, config_path=None, journal_path=None):
        self.core = core
        root = Path(getattr(core, "__file__", __file__)).resolve().parent
        self.config_path = Path(config_path or root / "smio_demo_config.json")
        self.journal_path = Path(journal_path or root / "smio_demo_journal.json")
        self.routing_lock = asyncio.Lock()
        self.refresh_timeout = 10
        self.health = {}

    @staticmethod
    def timestamp():
        return datetime.now(timezone.utc).isoformat()

    def note(self, state, row, stage, reason=None):
        """Bounded forensic history; never overwrite the first failure with a retry."""
        at = self.timestamp()
        row["last_evaluated_at"] = at
        if reason:
            row["recovery_blocker"] = reason
            row.setdefault("first_failure", {"at": at, "stage": stage, "reason": reason})
        event = {"at": at, "stage": stage, "state": row.get("state"), "reason": reason}
        history = row.setdefault("lifecycle_history", [])
        if not history or any(history[-1].get(k) != event[k] for k in ("stage", "state", "reason")):
            history.append(event)
            del history[:-32]
        self.save(state)

    async def read_broker(self, name, *args):
        method = getattr(self.core.ib, name, None)
        if not callable(method):
            raise ValueError("SMIO broker evidence unavailable: " + name)
        try:
            value = await asyncio.wait_for(method(*args), timeout=self.refresh_timeout)
        except Exception as exc:
            raise ValueError("SMIO broker refresh failed: " + name + ":" + type(exc).__name__) from None
        if not isinstance(value, list):
            raise ValueError("SMIO broker response invalid: " + name)
        return value

    async def permitted_close_session(self, data):
        """Intersect configured RTH with authoritative stock liquidHours."""
        from zoneinfo import ZoneInfo
        try:
            from .smio_eod_policy import session_close_from_ib
        except ImportError:
            from smio_eod_policy import session_close_from_ib
        if not self.core.is_us_stock_rth_now():
            raise ValueError("market close queued for permitted RTH; target retained")
        contract = await asyncio.wait_for(self.core.qualify_contract(data), self.refresh_timeout)
        details = await self.read_broker("reqContractDetailsAsync", contract)
        if getattr(contract, "secType", "") != "STK" or len(details) != 1:
            raise ValueError("SMIO stock session unavailable or ambiguous")
        if getattr(getattr(details[0], "contract", None), "secType", "") != "STK":
            raise ValueError("SMIO stock session contract mismatch")
        now = datetime.now(ZoneInfo("America/New_York"))
        tz = self.core.ib_session_timezone(getattr(details[0], "timeZoneId", ""))
        end = session_close_from_ib(details[0], now, tz, self.core.parse_ib_session_stamp)
        if end is None or not end.replace(hour=9, minute=30, second=0, microsecond=0) <= now < end:
            raise ValueError("SMIO broker RTH session not permitted")
        return contract, end

    def load(self):
        if not self.journal_path.exists():
            return {"events": {}, "setups": {}}
        state = json.loads(self.journal_path.read_text(encoding="utf-8"))
        if not isinstance(state.get("events"), dict) or not isinstance(state.get("setups"), dict):
            raise ValueError("invalid SMIO journal; broker actions blocked")
        return state

    def save(self, state):
        self.journal_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.journal_path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as stream:
            json.dump(state, stream, sort_keys=True, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, self.journal_path)

    def active(self, state, symbol):
        return [r for r in state["setups"].values() if r["payload"]["symbol"] == symbol and r["state"] != "CLOSED"]

    async def environment(self):
        config = json.loads(self.config_path.read_text(encoding="utf-8"))
        if config.get("experimental_contract") != CONTRACT or config.get("simulated_ui_verified") is not True:
            raise ValueError("demo session attestation missing")
        if not callback_key(self.core) or not self.core.RENDER_WEBHOOK_URL:
            raise ValueError("authenticated demo publication unavailable")
        await asyncio.wait_for(self.core.ensure_ib_connected(), self.refresh_timeout)
        accounts = list(self.core.ib.managedAccounts())
        if accounts != [config.get("account")]:
            raise ValueError("connected session differs from verified demo account")
        return config

    def snapshot(self, config, data):
        # This directory contains only UAM's source/settings snapshots, never cookies.
        directory = Path(config["uam_snapshot_directory"])
        filename = f"{data['symbol']}_{data['timeframe']}_{digest(data['configuration_id'])[:16]}.json"
        snap = json.loads((directory / filename).read_text(encoding="utf-8"))
        if any(snap.get(k) != data[k] for k in ("symbol", "timeframe", "configuration_id")):
            raise ValueError("UAM snapshot mismatch")
        if snap.get("properties_verified") is not True or snap.get("experimental_contract") != CONTRACT:
            raise ValueError("UAM settings not verified")
        if snap.get("status") not in ("PREPARED", "CREATED"):
            raise ValueError("UAM alert was not prepared for creation")

    def trades(self, symbol):
        # Live objects carry status callbacks; completed snapshots must not replace them.
        trades = getattr(self, "completed_trades", []) + list(self.core.ib.trades())
        unique = {}
        for trade in trades:
            key = (trade.order.account, trade.order.orderRef, trade.order.orderId)
            unique[key] = trade
        return [t for t in unique.values() if getattr(t.contract, "symbol", "") == symbol]

    def exact_trade(self, symbol, account, ref, order_id):
        matches = [t for t in self.trades(symbol) if t.order.account == account and
                   t.order.orderRef == ref and t.order.orderId == order_id]
        if len(matches) > 1:
            raise ValueError("ambiguous broker identity")
        return matches[0] if matches else None

    def working(self, symbol):
        return [t for t in self.core.ib.openTrades() if getattr(t.contract, "symbol", "") == symbol]

    def executions(self, row, role):
        combined = {}
        for order in [*row.get("retired_" + role + "s", []), row.get(role)]:
            if order:
                combined.update(self.order_executions(row, order))
        return combined

    def order_executions(self, row, order):
        """Append exact IB executions; retain them across process restart."""
        trade = self.exact_trade(row["payload"]["symbol"], row["account"], order["ref"], order["id"])
        known = dict(order.get("executions", {}))
        fills = list(getattr(trade, "fills", []) or []) if trade else []
        # A core API refresh also populates fills after restart. Bind by exact
        # account/order identity, never by symbol or assumed target price.
        for fill in list(self.core.ib.fills()) + fills:
            e = fill.execution
            if e.acctNumber != row["account"] or e.orderId != order["id"] or e.orderRef != order["ref"]:
                continue
            action = "BOT" if order["action"] == "BUY" else "SLD"
            if e.side != action or fill.contract.symbol != row["payload"]["symbol"]:
                raise ValueError("execution ownership conflict")
            value = {"qty": float(e.shares), "price": float(e.price)}
            if not e.execId or any(not math.isfinite(v) or v <= 0 for v in value.values()):
                raise ValueError("invalid execution evidence")
            if e.execId in known and known[e.execId] != value:
                raise ValueError("conflicting execution evidence")
            known[e.execId] = value
        order["executions"] = known
        return known

    @staticmethod
    def total(fills):
        qty = sum(v["qty"] for v in fills.values())
        return qty, sum(v["qty"] * v["price"] for v in fills.values()) / qty if qty else 0

    async def refreshed(self):
        # Read-only synchronization, on the existing connection/client identity.
        self.execution_refresh = {"supported": True, "ok": False, "values": []}
        await self.read_broker("reqPositionsAsync")
        await self.read_broker("reqAllOpenOrdersAsync")
        executions = await self.read_broker("reqExecutionsAsync")
        self.execution_refresh = {"supported": True, "ok": isinstance(executions, list), "values": executions or []}
        self.completed_trades = await self.read_broker("reqCompletedOrdersAsync", False)

    def ownership_history(self, state, row):
        metadata = self.core.execution_history_coverage_metadata(row["coverage"], self.execution_refresh)
        row["coverage"].update(metadata)
        self.save(state)
        if metadata.get("execution_history_covers_signal") is not True:
            raise ValueError("SMIO execution history coverage unproven: " + str(metadata.get("coverage_reason")))
        since = self.core.comparable_execution_time(row["coverage"]["execution_coverage_required_from"])
        orders = [row.get(role) for role in ("entry", "target", "close")]
        orders += row.get("retired_targets", []) + row.get("retired_closes", [])
        expected = {(order["id"], order["ref"]) for order in orders if order}
        for fill in self.core.ib.fills():
            execution = fill.execution
            if execution.acctNumber != row["account"] or fill.contract.symbol != row["payload"]["symbol"]:
                continue
            when = self.core.comparable_execution_time(getattr(execution, "time", None))
            if when is None:
                raise ValueError("symbol execution time unproven")
            if when >= since and (execution.orderId, execution.orderRef) not in expected:
                raise ValueError("foreign execution changed symbol ownership")

    async def handle(self, data):
        attempted = False
        received_at = self.timestamp()
        try:
            validate(data)
            async with self.routing_lock, self.core.ib_lock:
                config = await self.environment()
                if data.get("dry_run") is True or self.core.DRY_RUN:
                    return {"status": "smio_dry_run", "broker_execution": False}
                self.snapshot(config, data)
                await self.refreshed()
                state = self.load()
                old = state["events"].get(data["event_id"])
                existing = state["setups"].get(data["setup_id"])
                if existing and existing.get("account") != config["account"]:
                    raise ValueError("journal account differs from verified demo account")
                # Render-only forwarding fields are not part of event-body identity.
                body = {k: v for k, v in data.items() if not k.startswith("render_") and k != "dry_run"}
                body_hash = digest(body)
                if existing and (not old or old["hash"] == body_hash):
                    existing.setdefault("signal_receipts", {}).setdefault(data["event_id"], received_at)
                    self.note(state, existing, "signal_handler")
                if old:
                    if old["hash"] != body_hash:
                        raise ValueError("event body conflict")
                    row = state["setups"].get(data["setup_id"])
                    if data["signal"] == "CLOSE" and row and row["state"] == "TARGET_CANCEL_PENDING" and not row.get("close"):
                        attempted = True
                        await self.close(state, row, data, body_hash)
                        return {"status": "smio_demo_accepted", "broker_execution": True}
                    return {"status": "smio_duplicate", "broker_execution": False}
                symbol, setup = data["symbol"], data["setup_id"]
                if data["signal"] != "CLOSE":
                    if setup in state["setups"] or self.active(state, symbol) or self.core.load_managed_positions().get(symbol):
                        raise ValueError("symbol / setup already reserved")
                    if abs(await self.core.get_position_size(symbol)) > 0.000001 or self.working(symbol):
                        raise ValueError("foreign broker position / working order")
                    self.core.validate_pretrade_risk(symbol, data["side"], data["entry"], data["qty"], "STK")
                    self.core.validate_entry_timing("MARKET", "STK")
                    attempted = True
                    await self.entry(state, data, config, body_hash)
                else:
                    row = state["setups"].get(setup)
                    if not row or row["payload"]["symbol"] != symbol or row["payload"]["side"] != data["side"]:
                        raise ValueError("close does not own active setup")
                    if row["state"] in ("ENTRY_SUBMITTING", "ENTRY_PENDING"):
                        state["events"][data["event_id"]] = {"hash": body_hash}
                        row["close_signal"] = dict(data)
                        self.save(state)
                        return {"status": "smio_demo_close_waits_for_entry", "broker_execution": False}
                    attempted = True
                    await self.close(state, row, data, body_hash)
                return {"status": "smio_demo_accepted", "broker_execution": True}
        except Exception as error:
            # A failed acknowledgement/save after submission is not proof that
            # no order exists. Persisted intent retains restart/retry ownership.
            row = None
            journal_loaded = False
            try:
                # Mutating journal diagnostics also share the lifecycle lock.
                async with self.routing_lock, self.core.ib_lock:
                    latest = self.load()
                    journal_loaded = True
                    row = latest["setups"].get(data.get("setup_id"))
                    if row:
                        row.setdefault("signal_receipts", {}).setdefault(data.get("event_id", "unknown"), received_at)
                        self.note(latest, row, "signal_failed", str(error))
            except Exception:
                pass  # A failed diagnostic save must not erase known intent.
            possible = bool(attempted and (not journal_loaded or row and row.get("state") in ("ENTRY_SUBMITTING", "ENTRY_PENDING", "CLOSE_SUBMITTING", "CLOSE_PENDING")))
            return {"status": "smio_demo_recovery_required" if possible else "smio_demo_blocked",
                    "reason": str(error), "broker_execution": None if possible else False}

    async def entry(self, state, data, config, body_hash):
        core, account = self.core, config["account"]
        contract = await core.qualify_contract(data)
        if data["target_mode"] != "RSI_80_20":
            details = await asyncio.wait_for(core.ib.reqContractDetailsAsync(contract), timeout=10)
            if len(details) != 1 or float(details[0].minTick) <= 0:
                raise ValueError("target tick-size evidence unavailable")
            ticks = Decimal(str(data["target"])) / Decimal(str(details[0].minTick))
            if ticks != ticks.to_integral_value():
                raise ValueError("frozen target is not a valid broker tick; no rounding or order")
        suffix = digest(data["setup_id"])[:20]
        action = "BUY" if data["side"] == "LONG" else "SELL"
        order = core.MarketOrder(action, data["qty"], tif="DAY", account=account)
        order.orderId = core.ib.client.getReqId()
        order.orderRef = "SMIOE_" + suffix
        target = None
        if data["target_mode"] != "RSI_80_20":
            order.transmit = False
            target = core.LimitOrder("SELL" if action == "BUY" else "BUY", data["qty"], data["target"],
                                     tif="GTC", outsideRth=False, account=account)
            target.orderId = core.ib.client.getReqId()
            target.parentId = order.orderId
            target.orderRef = "SMIOT_" + suffix
            target.transmit = True
        row = {"payload": dict(data), "account": account, "state": "ENTRY_SUBMITTING",
               "submitted_at": time.time(),
               "entry": {"id": order.orderId, "ref": order.orderRef, "action": action}}
        row["coverage"] = {"execution_coverage_required_from": datetime.now(timezone.utc).isoformat(),
                           "bridge_process_instance_id": self.core.BRIDGE_PROCESS_INSTANCE_ID,
                           "ib_connection_generation": self.core._ib_connection_generation}
        if target:
            row["target"] = {"id": target.orderId, "ref": target.orderRef, "action": target.action}
        state["setups"][data["setup_id"]] = row
        state["events"][data["event_id"]] = {"hash": body_hash}
        self.save(state)  # write-ahead before any broker mutation
        trade = core.ib.placeOrder(contract, order)
        row["entry"]["perm_id"] = getattr(trade.order, "permId", 0)
        if target:
            core.ib.placeOrder(contract, target)
        row["state"] = "ENTRY_PENDING"
        self.save(state)

    async def cancel_exact(self, trade):
        if trade.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
            return True
        self.core.ib.cancelOrder(trade.order)
        for _ in range(40):
            if trade.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
                return True
            await asyncio.sleep(0.1)
        return False

    async def stop_stale_target(self, state, row):
        # A proven foreign execution ends ownership. Cancel our own exit only;
        # leave the foreign position/orders untouched and reserve for review.
        order = row.get("target")
        trade = self.exact_trade(row["payload"]["symbol"], row["account"], order["ref"], order["id"]) if order else None
        if trade:
            row["state"] = "OWNERSHIP_LOST"
            self.save(state)
            await self.cancel_exact(trade)

    async def close(self, state, row, data, body_hash):
        symbol, side = data["symbol"], data["side"]
        config = await self.environment()
        if self.core.DRY_RUN or row.get("account") != config["account"]:
            raise ValueError("SMIO close account / dry-run gate")
        if row.get("close") or row["state"] not in ("OPEN", "TARGET_CANCEL_PENDING"):
            raise ValueError("entry / close state is unresolved")
        known_qty = row["filled_qty"]
        self.ownership_history(state, row)
        target_qty, _ = self.total(self.executions(row, "target"))
        position = await self.core.get_position_size(symbol)
        if abs(position) <= 0.000001:
            raise ValueError("already flat; exact reconciliation owns publication")
        closed_qty, _ = self.total(self.executions(row, "close"))
        expected = known_qty - target_qty - closed_qty
        if (position > 0) != (side == "LONG") or abs(position) != expected:
            raise ValueError("position / ownership mismatch")
        target = row.get("target")
        owned = self.exact_trade(symbol, row["account"], target["ref"], target["id"]) if target else None
        if target and owned is None:
            raise ValueError("exact target unconfirmed")
        for trade in self.working(symbol):
            if trade is not owned:
                raise ValueError("foreign working order; no cancellation")
        # Persist signal and intent BEFORE target cancellation. A crash resumes
        # observation only; it never blindly repeats a market submission.
        state["events"][data["event_id"]] = {"hash": body_hash}
        row["close_signal"] = dict(data)
        row["state"] = "TARGET_CANCEL_PENDING"
        self.save(state)
        # Demo close orders must respect RTH even when the shared legacy
        # bridge's optional market-close block is disabled.
        await self.permitted_close_session(data)
        self.note(state, row, "close_session_permitted")
        if owned and owned.orderStatus.status not in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
            row["last_broker_action_at"] = self.timestamp()
            self.note(state, row, "target_cancel_intent")
            self.core.ib.cancelOrder(owned.order)
            for _ in range(40):
                if owned.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
                    break
                await asyncio.sleep(0.1)
            if owned.orderStatus.status not in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
                raise ValueError("target cancellation unconfirmed")
        await self.refreshed()
        # Complete every awaited session/account query before the final ownership
        # and position proof; broker callbacks may arrive during those queries.
        contract, session_end = await self.permitted_close_session(data)
        config = await self.environment()
        if row.get("account") != config["account"]:
            raise ValueError("journal account differs from verified demo account")
        position = await self.core.get_position_size(symbol)
        self.ownership_history(state, row)
        if self.working(symbol):
            raise ValueError("working order remains after target cancellation")
        target_qty, _ = self.total(self.executions(row, "target"))
        remaining = known_qty - target_qty - closed_qty
        if remaining < 0 or int(remaining) != remaining:
            raise ValueError("remaining broker quantity is not exact whole shares")
        if remaining == 0 and abs(position) <= 0.000001:
            row["state"] = "TARGET_WON"
            self.save(state)
            return
        if abs(position) != remaining or (position > 0) != (side == "LONG"):
            raise ValueError("partial target / position synchronization unconfirmed")
        action = "SELL" if side == "LONG" else "BUY"
        order = self.core.MarketOrder(action, remaining, tif="DAY", account=row["account"])
        order.orderId = self.core.ib.client.getReqId()
        order.orderRef = "SMIOC_" + digest(data["setup_id"])[:20] + "_" + str(len(row.get("retired_closes", [])))
        row["close"] = {"id": order.orderId, "ref": order.orderRef, "action": action}
        row["state"] = "CLOSE_SUBMITTING"
        row["close_submitted_at"] = time.time()
        row["last_broker_action_at"] = self.timestamp()
        self.save(state)
        if datetime.now(timezone.utc) >= session_end or not self.core.is_us_stock_rth_now():
            # No await or broker mutation occurred after reservation; safe to unreserve.
            row.pop("close")
            row.pop("close_submitted_at")
            row["state"] = "TARGET_CANCEL_PENDING"
            self.note(state, row, "close_deferred", "SMIO session ended before submission")
            raise ValueError("SMIO session ended before submission")
        self.core.ib.placeOrder(contract, order)
        row["state"] = "CLOSE_PENDING"
        row.pop("recovery_blocker", None)
        self.note(state, row, "close_submitted")
        self.save(state)

    def enqueue(self, state, row, payload, role):
        key = role + "_delivery_id"
        if row.get(key):
            return
        payload["bridge_delivery_id"] = "SMIO:" + role + ":" + digest(payload)[:24]
        # Persist exact payload before putting it in the existing durable outbox.
        row[role + "_callback"] = payload
        self.save(state)
        delivery, saved = self.core.enqueue_render_outbox(payload)
        if not saved:
            raise ValueError("callback outbox persistence failed")
        row[key] = delivery
        self.save(state)

    async def session_diagnostic(self, symbol):
        """Read-only, SMIO demo-account-attested IB STK session inquiry."""
        from datetime import datetime as _datetime
        from zoneinfo import ZoneInfo
        import re
        try:
            from .smio_eod_policy import session_close_from_ib
        except ImportError:
            from smio_eod_policy import session_close_from_ib

        symbol = str(symbol or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{1,5}", symbol):
            return {"ok": False, "error": "invalid_stock_symbol"}
        try:
            async with self.core.ib_lock:
                await self.environment()  # match exact attested simulated account
                contract = await self.core.qualify_contract(
                    {"symbol": symbol, "sec_type": "STK"}
                )
                if getattr(contract, "secType", "") != "STK":
                    raise ValueError("contract is not STK")
                response = await self.core.bounded_ib_refresh_request(
                    "reqContractDetailsAsync", contract
                )
            details = list(response.get("values") or [])
            if not response.get("ok") or len(details) != 1:
                raise ValueError("IB stock session details unavailable or ambiguous")
            item = details[0]
            if getattr(getattr(item, "contract", None), "secType", "") != "STK":
                raise ValueError("IB contract details not STK")
            now = _datetime.now(ZoneInfo("America/New_York"))
            tz = self.core.ib_session_timezone(getattr(item, "timeZoneId", ""))
            close = session_close_from_ib(item, now, tz,
                                         self.core.parse_ib_session_stamp)
            from datetime import timedelta as _timedelta
            return {
                "ok": True, "symbol": symbol, "sec_type": "STK",
                "time_zone_id": str(getattr(item, "timeZoneId", "") or ""),
                "liquid_hours": str(getattr(item, "liquidHours", "") or ""),
                "session_verified": close is not None,
                "session_close_et": close.isoformat() if close else None,
                "smio_eod_start_et": (close - _timedelta(minutes=5)).isoformat() if close else None,
                "query_date_et": now.date().isoformat(),
            }
        except Exception as exc:
            # No credentials, account numbers or endpoint tokens in the response.
            return {"ok": False, "symbol": symbol,
                    "error": "SMIO demo STK session verification unavailable"}

    async def eod_failsafe_pass(self, now_value=None):
        """SMIO-only demo exit five minutes ahead of confirmed IB stock session end."""
        from datetime import datetime as _datetime, time as _time
        from zoneinfo import ZoneInfo
        try:
            from .smio_eod_policy import eod_due, eod_close_payload, session_close_from_ib
        except ImportError:
            from smio_eod_policy import eod_due, eod_close_payload, session_close_from_ib

        enabled = os.getenv("SMIO_DEMO_EOD_FAILSAFE_ENABLED", "").strip().lower()
        self.health["eod_enabled"] = enabled in ("1", "true", "yes", "on")
        self.health["eod_last_evaluated_at"] = self.timestamp()
        if enabled not in ("1", "true", "yes", "on"):
            self.health["eod_result"] = "disabled"
            return
        now = now_value or _datetime.now(ZoneInfo("America/New_York"))
        if now.tzinfo is None:
            self.health["eod_result"] = "invalid_clock"
            return
        now = now.astimezone(ZoneInfo("America/New_York"))
        # Cheap, conservative scan boundary. Session close is always sourced from IB.
        if now.weekday() >= 5 or not (_time(12, 50) <= now.time() < _time(16, 0)):
            self.health["eod_result"] = "outside_scan_window"
            return
        if not self.core.is_us_stock_rth_now():
            self.health["eod_result"] = "outside_configured_rth"
            return
        state = self.load()
        self.health["eod_result"] = "evaluating"
        for row in list(state["setups"].values()):
            if row.get("state") != "OPEN" or row.get("close_signal") or row.get("close"):
                continue
            payload = row.get("payload")
            if not isinstance(payload, dict) or payload.get("sec_type") != "STK" or not row.get("filled_qty"):
                continue
            symbol = payload.get("symbol", "")
            try:
                # No cached or hard-coded holiday/early-close assumptions:
                # each authorized close requires one authoritative IB contract session.
                async with self.routing_lock, self.core.ib_lock:
                    await self.environment()
                    contract = await asyncio.wait_for(self.core.qualify_contract(payload), self.refresh_timeout)
                    details = await self.read_broker("reqContractDetailsAsync", contract)
                if len(details) != 1:
                    raise ValueError("IB session details unavailable or ambiguous")
                session_tz = self.core.ib_session_timezone(
                    getattr(details[0], "timeZoneId", "")
                )
                close_time = session_close_from_ib(
                    details[0], now, session_tz, self.core.parse_ib_session_stamp
                )
                if close_time is None:
                    raise ValueError("IB stock session schedule missing or ambiguous")
                if not eod_due(now, enabled, close_time):
                    continue
                close = eod_close_payload(payload, now, close_time)
                result = await self.handle(close)
                if result.get("status") not in ("smio_demo_accepted", "smio_duplicate"):
                    self.health["eod_result"] = "blocked"
                    print("[SMIO DEMO EOD BLOCKED]", symbol,
                          result.get("status", ""), result.get("reason", ""))
            except Exception as exc:
                self.health["eod_result"] = "blocked"
                print("[SMIO DEMO EOD BLOCKED]", symbol, type(exc).__name__)
        if self.health["eod_result"] == "evaluating":
            self.health["eod_result"] = "evaluated"
            self.health["eod_last_successful_evaluation_at"] = self.timestamp()

    async def maintenance_pass(self):
        """One failed reconciliation must not silently suppress the EOD evaluation."""
        for name in ("reconcile", "eod_failsafe_pass"):
            self.health[name + "_started_at"] = self.timestamp()
            try:
                await getattr(self, name)()
                self.health[name + "_last_success_at"] = self.timestamp()
                self.health.pop(name + "_error", None)
            except Exception as error:
                # Exception type only: broker/network exception text can carry identifiers.
                self.health[name + "_error"] = type(error).__name__
                print("[SMIO DEMO MAINTENANCE BLOCKED]", name, type(error).__name__)
            finally:
                self.health[name + "_finished_at"] = self.timestamp()

    async def reconcile(self):
        async with self.routing_lock, self.core.ib_lock:
            if self.core.DRY_RUN:
                return
            if not any(row["state"] != "CLOSED" for row in self.load()["setups"].values()):
                return
            config = await self.environment()
            await self.refreshed()
            state = self.load()
            for row in state["setups"].values():
                if row["state"] == "CLOSED":
                    continue
                if row.get("account") != config["account"]:
                    self.note(state, row, "reconcile_blocked", "journal account differs from verified demo account")
                    continue
                if row["state"] in ("OPEN", "TARGET_CANCEL_PENDING") and row.get("close_signal") and not row.get("close"):
                    try:
                        event = state["events"][row["close_signal"]["event_id"]]
                        await self.close(state, row, row["close_signal"], event["hash"])
                    except Exception as error:
                        self.note(state, row, "close_recovery", str(error))
                data = row["payload"]
                qty, price = self.total(self.executions(row, "entry"))
                target_fills = self.executions(row, "target")
                close_fills = self.executions(row, "close")
                self.save(state)  # retained exact executions survive restart
                try:
                    self.ownership_history(state, row)
                except ValueError as error:
                    row["recovery_blocker"] = str(error)
                    self.save(state)
                    if str(error) == "foreign execution changed symbol ownership":
                        await self.stop_stale_target(state, row)
                    continue
                parent = self.exact_trade(data["symbol"], row["account"], row["entry"]["ref"], row["entry"]["id"])
                terminal = parent and parent.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive")
                if qty and parent and not terminal:
                    row.setdefault("partial_seen_at", time.time())
                    self.save(state)
                    if time.time() - row["partial_seen_at"] >= max(getattr(self.core, "PARTIAL_FILL_GRACE_SECONDS", 2), 0):
                        await self.cancel_exact(parent)
                    continue  # re-query executions/positions before adopting quantity
                if not qty:
                    if terminal and abs(await self.core.get_position_size(data["symbol"])) <= 0.000001:
                        target = row.get("target")
                        child = self.exact_trade(data["symbol"], row["account"], target["ref"], target["id"]) if target else None
                        if target and child is None:
                            continue
                        if child and not await self.cancel_exact(child):
                            continue
                        # Observe cancellation/executions again before releasing.
                        await self.refreshed()
                        if not self.executions(row, "entry") and not self.executions(row, "target") and abs(await self.core.get_position_size(data["symbol"])) <= 0.000001:
                            row["state"] = "CLOSED"
                            row["result"] = "NO_ENTRY_EXECUTION"
                            self.save(state)
                    continue
                if not terminal:
                    continue
                if qty > data["qty"] or int(qty) != qty:
                    raise ValueError("entry fill quantity conflict")
                if parent.orderStatus.status == "Filled" and qty != data["qty"]:
                    raise ValueError("Filled parent lacks its complete execution evidence")
                position = await self.core.get_position_size(data["symbol"])
                if not row.get("filled_qty"):
                    # Partial terminal parent: repair ONLY its exact target to
                    # the broker-confirmed filled quantity before publishing.
                    target = row.get("target")
                    if target:
                        child = self.exact_trade(data["symbol"], row["account"], target["ref"], target["id"])
                        if child is None:
                            continue
                        if child.orderStatus.status in ("Cancelled", "ApiCancelled", "Inactive"):
                            if len(row.get("retired_targets", [])) >= 2:
                                row["recovery_blocker"] = "target replacement limit reached"
                                self.save(state)
                                continue
                            target_qty, _ = self.total(target_fills)
                            if target_qty or abs(position) != qty or self.working(data["symbol"]):
                                continue
                            replacement = self.core.LimitOrder(child.order.action, qty, data["target"],
                                                               tif="GTC", outsideRth=False, account=row["account"])
                            replacement.orderId = self.core.ib.client.getReqId()
                            replacement.orderRef = "SMIOT_" + digest(data["setup_id"])[:20] + "_" + str(len(row.get("retired_targets", [])) + 1)
                            row.setdefault("retired_targets", []).append(target)
                            row["target"] = {"id": replacement.orderId, "ref": replacement.orderRef, "action": replacement.action}
                            self.save(state)
                            self.core.ib.placeOrder(child.contract, replacement)
                            continue
                        if child.order.totalQuantity != qty:
                            if abs(position) != qty or child.orderStatus.status not in ("Submitted", "PreSubmitted"):
                                continue
                            child.order.totalQuantity = qty
                            self.core.ib.placeOrder(child.contract, child.order)
                            continue
                    row["filled_qty"] = qty
                    row["state"] = "OPEN"
                    self.save(state)
                entry = {**data, "source": "IB_BRIDGE", "event": "ENTRY_FILL", "trade_id": data["setup_id"],
                         "entry": price, "price": price, "qty": qty, "entry_filled": True,
                         "ib_entry_status": parent.orderStatus.status, "ib_entry_fill_price": price, "ib_entry_filled_qty": qty,
                         "ib_status": "smio_demo_filled", "entry_exec_ids": sorted(row["entry"]["executions"]),
                         "entry_execution_id": "IB_BRIDGE:" + ",".join(sorted(row["entry"]["executions"])),
                         "ib_order_id": row["entry"]["id"], "ib_order_ref": row["entry"]["ref"]}
                if row.get("target"):
                    entry.update(ib_target_order_id=row["target"]["id"], ib_target_order_ref=row["target"]["ref"])
                self.enqueue(state, row, entry, "entry")
                close_order = row.get("close")
                if close_order and position:
                    close_trade = self.exact_trade(data["symbol"], row["account"], close_order["ref"], close_order["id"])
                    closed_qty, _ = self.total(close_fills)
                    target_qty, _ = self.total(target_fills)
                    if close_trade and closed_qty < qty - target_qty:
                        close_terminal = close_trade.orderStatus.status in ("Cancelled", "ApiCancelled", "Inactive")
                        if not close_terminal and closed_qty and time.time() - row.get("close_submitted_at", time.time()) >= max(getattr(self.core, "PARTIAL_FILL_GRACE_SECONDS", 2), 0):
                            await self.cancel_exact(close_trade)
                            continue
                        if close_terminal and len(row.get("retired_closes", [])) < 2:
                            row.setdefault("retired_closes", []).append(row.pop("close"))
                            row["state"] = "TARGET_CANCEL_PENDING"
                            self.save(state)
                            # Next iteration repeats ownership/position proofs.
                            continue
                all_exits = {**target_fills, **close_fills}
                exit_qty, exit_price = self.total(all_exits)
                if abs(position) <= 0.000001 and exit_qty == qty:
                    # Publication ordering must not suspend partial-close recovery.
                    if row["entry_delivery_id"] in self.core.load_render_outbox():
                        continue
                    if self.working(data["symbol"]):
                        self.note(state, row, "publication_blocked", "working orders remain on flat symbol")
                        continue
                    reason = row.get("close_signal", {}).get("reason") if close_fills else "ATR_TARGET"
                    exit_event = "TP" if not close_fills or reason == "RSI_PROFIT" else "EOD_CLOSE" if reason == "RTH_EOD" else "CLOSE_STOP"
                    order = row["close"] if close_fills else row["target"]
                    callback = {**data, "source": "IB_BRIDGE", "event": exit_event, "reason": reason, "trade_id": data["setup_id"],
                                "qty": qty, "entry": price, "price": exit_price, "exit": exit_price,
                                "broker_confirmed_flat": True, "position_after_close": 0,
                                "close_filled": True, "ib_close_status": "Filled", "ib_status": "smio_demo_closed",
                                "ib_order_id": order["id"], "ib_order_ref": order["ref"],
                                "ib_close_fill_price": exit_price, "ib_close_filled_qty": qty,
                                "close_exec_ids": sorted(all_exits),
                                "exit_execution_id": "IB_BRIDGE:" + ",".join(sorted(all_exits)),
                                "reconciliation_id": digest(sorted(all_exits)), "execution_components": all_exits}
                    if row.get("target"):
                        callback.update(ib_target_order_id=row["target"]["id"], ib_target_order_ref=row["target"]["ref"])
                    self.enqueue(state, row, callback, "exit")
                    if row["exit_delivery_id"] not in self.core.load_render_outbox():
                        row["state"] = "CLOSED"
                        self.save(state)


def install_smio_demo_adapter(core):
    if getattr(core, "_smio_demo_adapter_installed", False):
        return core
    lifecycle = DemoLifecycle(core)
    original_handle, original_background = core.handle_ib_action, core.process_signal_background
    original_forward = core.forward_to_render

    async def prior_day_entry_still_open(payload):
        # The calendar date is not proof of closure. Validate exact broker
        # ownership before allowing an overnight entry to be published.
        async with lifecycle.routing_lock, core.ib_lock:
            await lifecycle.environment()
            await lifecycle.refreshed()
            state = lifecycle.load()
            row = state["setups"].get(payload.get("setup_id"))
            if not row or row.get("state") != "OPEN" or row.get("close_signal") or row.get("close"):
                return False
            if row.get("entry_delivery_id") != payload.get("bridge_delivery_id"):
                return False
            if row.get("account") not in core.ib.managedAccounts():
                return False
            if row.get("entry", {}).get("ref") != payload.get("ib_order_ref"):
                return False
            if row.get("entry", {}).get("id") != payload.get("ib_order_id"):
                return False
            # An interrupted execution history is ambiguous even if a same-
            # symbol position exists: do not treat the position alone as proof.
            lifecycle.ownership_history(state, row)
            qty, _ = lifecycle.total(lifecycle.executions(row, "entry"))
            if qty <= 0 or abs(qty - float(row.get("filled_qty") or 0)) > 0.000001:
                return False
            if lifecycle.executions(row, "target") or lifecycle.executions(row, "close"):
                return False
            position = await core.get_position_size(payload["symbol"])
            expected = qty if payload.get("side") == "LONG" else -qty
            if abs(position - expected) > 0.000001:
                return False
            target = row.get("target")
            if not target:
                return False
            owned_target = lifecycle.exact_trade(payload["symbol"], row["account"], target["ref"], target["id"])
            if not owned_target or owned_target not in lifecycle.working(payload["symbol"]):
                return False
            if any(trade is not owned_target for trade in lifecycle.working(payload["symbol"])):
                return False
            return True

    async def forward(payload):
        if is_smio_rsi_payload(payload):
            if stale_smio_entry_callback(payload):
                try:
                    verified_open = await prior_day_entry_still_open(payload)
                except Exception:
                    verified_open = False
                if not verified_open:
                    return {"forwarded": False, "quarantine": True,
                            "reason": "smio_prior_day_entry_ownership_unverified"}
            return await asyncio.to_thread(send_callback, core, payload)
        return await original_forward(payload)

    async def handle(data):
        if is_smio_rsi_payload(data):
            return await lifecycle.handle(data)
        async with lifecycle.routing_lock:
            async with core.ib_lock:
                candidates = lifecycle.active(lifecycle.load(), str(data.get("symbol", "")).upper())
                accounts = list(core.ib.managedAccounts()) if candidates else []
                owned = [row for row in candidates if row["account"] in accounts]
                if str(data.get("event", "")).upper() in {"SETUP", "ENTRY", "CLOSE_POSITION", "CLOSE_STOP", "TP", "EOD_CLOSE", "CANCEL", "NEW_DAY_RESET", "EOD_RESET"} and owned:
                    return {"status": "smio_symbol_reserved", "broker_execution": False}
            return await original_handle(data)

    async def background(data):
        if is_smio_rsi_payload(data):
            result = await lifecycle.handle(data)
            print("[SMIO DEMO SIGNAL]", data.get("symbol", ""), data.get("event", ""), result.get("status"), result.get("reason", ""))
            if result.get("status") == "smio_demo_accepted":
                await lifecycle.reconcile()
            return result
        return await original_background(data)

    async def reconcile_loop():
        while True:
            if lifecycle.config_path.exists():
                await lifecycle.maintenance_pass()
            await asyncio.sleep(2)

    async def startup():
        core._smio_demo_task = asyncio.create_task(reconcile_loop())

    async def demo_status():
        result = {"experimental_contract": CONTRACT, "demo_only": True, "ready": False,
                  "maintenance": {**lifecycle.health,
                      "eod_enabled": os.getenv("SMIO_DEMO_EOD_FAILSAFE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on"),
                      "task_running": bool(getattr(core, "_smio_demo_task", None)) and not core._smio_demo_task.done()}}
        try:
            await lifecycle.environment()
            result["ready"] = not core.DRY_RUN and bool(callback_key(core))
        except Exception:
            pass
        return result

    core.handle_ib_action, core.process_signal_background = handle, background
    core.forward_to_render = forward
    core.app.on_event("startup")(startup)
    core.app.get("/ib/smio-demo-status")(demo_status)
    async def demo_session(symbol: str = "APA"):
        return await lifecycle.session_diagnostic(symbol)

    core.app.get("/ib/smio-demo-session")(demo_session)
    core._smio_demo_lifecycle = lifecycle
    core._smio_demo_adapter_installed = True
    return core
