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
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
from decimal import Decimal

try:
    from .smio_demo_contract import CONTRACT, validate
    from .smio_rsi_gate import is_smio_rsi_payload
except ImportError:
    from smio_demo_contract import CONTRACT, validate
    from smio_rsi_gate import is_smio_rsi_payload


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
        await self.core.ensure_ib_connected()
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
        trades = list(self.core.ib.trades()) + getattr(self, "completed_trades", [])
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
            if not e.execId or value["qty"] <= 0 or value["price"] <= 0:
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
        await self.core.ib.reqPositionsAsync()
        await self.core.ib.reqOpenOrdersAsync()
        executions = await self.core.ib.reqExecutionsAsync()
        self.execution_refresh = {"supported": True, "ok": isinstance(executions, list), "values": executions or []}
        completed = getattr(self.core.ib, "reqCompletedOrdersAsync", None)
        self.completed_trades = await completed(False) if completed else []

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
        try:
            validate(data)
            async with self.routing_lock, self.core.ib_lock:
                config = await self.environment()
                self.snapshot(config, data)
                await self.refreshed()
                state = self.load()
                old = state["events"].get(data["event_id"])
                # Render-only forwarding fields are not part of event-body identity.
                body = {k: v for k, v in data.items() if not k.startswith("render_") and k != "dry_run"}
                body_hash = digest(body)
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
                if data.get("dry_run") is True or self.core.DRY_RUN:
                    return {"status": "smio_dry_run", "broker_execution": False}
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
            try:
                row = self.load()["setups"].get(data.get("setup_id"))
            except Exception:
                row = None
            possible = bool(attempted and row and row.get("state") in ("ENTRY_SUBMITTING", "ENTRY_PENDING", "CLOSE_SUBMITTING", "CLOSE_PENDING"))
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
        if not self.core.is_us_stock_rth_now():
            raise ValueError("market close queued for permitted RTH; target retained")
        if owned and owned.orderStatus.status not in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
            self.core.ib.cancelOrder(owned.order)
            for _ in range(40):
                if owned.orderStatus.status in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
                    break
                await asyncio.sleep(0.1)
            if owned.orderStatus.status not in ("Filled", "Cancelled", "ApiCancelled", "Inactive"):
                raise ValueError("target cancellation unconfirmed")
        await self.refreshed()
        target_qty, _ = self.total(self.executions(row, "target"))
        remaining = known_qty - target_qty - closed_qty
        if remaining < 0 or int(remaining) != remaining:
            raise ValueError("remaining broker quantity is not exact whole shares")
        position = await self.core.get_position_size(symbol)
        if remaining == 0 and abs(position) <= 0.000001:
            row["state"] = "TARGET_WON"
            self.save(state)
            return
        if abs(position) != remaining or (position > 0) != (side == "LONG"):
            raise ValueError("partial target / position synchronization unconfirmed")
        contract = await self.core.qualify_contract(data)
        action = "SELL" if side == "LONG" else "BUY"
        order = self.core.MarketOrder(action, remaining, tif="DAY", account=row["account"])
        order.orderId = self.core.ib.client.getReqId()
        order.orderRef = "SMIOC_" + digest(data["setup_id"])[:20] + "_" + str(len(row.get("retired_closes", [])))
        row["close"] = {"id": order.orderId, "ref": order.orderRef, "action": action}
        row["state"] = "CLOSE_SUBMITTING"
        row["close_submitted_at"] = time.time()
        self.save(state)
        self.core.ib.placeOrder(contract, order)
        row["state"] = "CLOSE_PENDING"
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

    async def eod_failsafe_pass(self):
        """Opt-in SMIO demo EOD. Reuse strict CLOSE handling, never bypass ownership."""
        from datetime import datetime as _datetime
        from zoneinfo import ZoneInfo
        try:
            from .smio_eod_policy import eod_due, eod_close_payload
        except ImportError:
            from smio_eod_policy import eod_due, eod_close_payload

        if not eod_due(_datetime.now(ZoneInfo("America/New_York")),
                       os.getenv("SMIO_DEMO_EOD_FAILSAFE_ENABLED", "")):
            return
        # A wall-clock window alone never proves the stock market is open.
        if not self.core.is_us_stock_rth_now():
            return
        # Read-only journal snapshot: handle() reacquires both existing locks,
        # reloads state and validates each synthetic EOD CLOSE before IB activity.
        state = self.load()
        for row in list(state["setups"].values()):
            if row.get("state") != "OPEN" or row.get("close_signal") or row.get("close"):
                continue
            payload = row.get("payload")
            if not isinstance(payload, dict) or not row.get("filled_qty"):
                continue
            close = eod_close_payload(payload, _datetime.now(ZoneInfo("America/New_York")))
            result = await self.handle(close)
            if result.get("status") not in ("smio_demo_accepted", "smio_duplicate"):
                print("[SMIO DEMO EOD BLOCKED]", payload.get("symbol", ""),
                      result.get("status", ""), result.get("reason", ""))

    async def reconcile(self):
        async with self.routing_lock, self.core.ib_lock:
            if not any(row["state"] != "CLOSED" for row in self.load()["setups"].values()):
                return
            await self.environment()
            await self.refreshed()
            state = self.load()
            for row in state["setups"].values():
                if row["state"] == "CLOSED":
                    continue
                if row["state"] in ("OPEN", "TARGET_CANCEL_PENDING") and row.get("close_signal") and not row.get("close"):
                    try:
                        event = state["events"][row["close_signal"]["event_id"]]
                        await self.close(state, row, row["close_signal"], event["hash"])
                    except Exception as error:
                        row["recovery_blocker"] = str(error)
                        self.save(state)
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
                # Close cannot overtake its OPEN callback after Render downtime.
                if row["entry_delivery_id"] in self.core.load_render_outbox():
                    continue
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

    async def forward(payload):
        if is_smio_rsi_payload(payload):
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
                try:
                    await lifecycle.reconcile()
                    await lifecycle.eod_failsafe_pass()
                except Exception as error:
                    print("[SMIO DEMO RECONCILIATION BLOCKED]", str(error))
            await asyncio.sleep(2)

    async def startup():
        core._smio_demo_task = asyncio.create_task(reconcile_loop())

    async def demo_status():
        try:
            await lifecycle.environment()
            return {"experimental_contract": CONTRACT, "demo_only": True,
                    "ready": not core.DRY_RUN and bool(callback_key(core))}
        except Exception:
            return {"experimental_contract": CONTRACT, "demo_only": True, "ready": False}

    core.handle_ib_action, core.process_signal_background = handle, background
    core.forward_to_render = forward
    core.app.on_event("startup")(startup)
    core.app.get("/ib/smio-demo-status")(demo_status)
    core._smio_demo_lifecycle = lifecycle
    core._smio_demo_adapter_installed = True
    return core
