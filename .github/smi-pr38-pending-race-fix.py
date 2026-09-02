from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one replacement, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


adapter = Path("bridge/smi_forward_adapter.py")
text = adapter.read_text(encoding="utf-8")
text = text.replace(
    "    pending_smi_symbols = set()\n",
    "    pending_smi_entries: Dict[str, Dict[str, Any]] = {}\n",
    1,
)

start = text.index("    async def pending_smi_ownership_block(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:\n")
end = text.index("    async def handle_ib_action_with_smi(data: Dict[str, Any]) -> Dict[str, Any]:\n", start)
new_helper = '''    async def pending_smi_ownership_block(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        symbol = _upper(data, "symbol")
        event = _upper(data, "event")
        pending = dict(pending_smi_entries.get(symbol) or {})
        if not pending or event not in SMI_OWNERSHIP_PROTECTED_EVENTS:
            return None

        incoming_smi = is_smi_forward_payload(data)
        blocked_status = (
            "smi_entry_blocked_pending_broker_ownership"
            if incoming_smi and event == "SETUP"
            else "smi_managed_symbol_reserved"
        )
        blocked_message = (
            "SMI entry blocked because a prior accepted SMI entry has not reached a proven terminal broker state."
            if blocked_status == "smi_entry_blocked_pending_broker_ownership"
            else "Broker-mutating foreign payload blocked while an accepted SMI entry still has broker ownership evidence."
        )

        row = _managed_smi_row(core, symbol)
        if _managed_row_is_smi(row):
            return _blocked(
                data,
                blocked_status,
                blocked_message,
                managed_setup_id=str(row.get("setup_id") or ""),
                pending_setup_id=str(pending.get("setup_id") or ""),
            )

        position = await core.get_position_size(symbol)
        working = []
        for trade in list(core.ib.openTrades() or []):
            contract_symbol = str(
                getattr(getattr(trade, "contract", None), "symbol", "") or ""
            ).upper().strip()
            if contract_symbol == symbol:
                working.append(trade)

        if abs(float(position or 0.0)) > 0.000001 or working:
            return _blocked(
                data,
                blocked_status,
                blocked_message,
                pending_setup_id=str(pending.get("setup_id") or ""),
                pending_order_id=pending.get("order_id", ""),
                working_order_count=len(working),
                position_before_action=position,
            )

        # A flat/no-open-order snapshot alone is not enough to release an
        # accepted entry reservation: IB caches can lag immediately after order
        # submission. Require the exact accepted parent order to have a proven
        # terminal history state. If history is unavailable/ambiguous, fail closed.
        all_known = getattr(core, "all_known_ib_trades", None)
        trade_status = getattr(core, "trade_status", None)
        known_trades = list(all_known() or []) if callable(all_known) else []
        expected_order_id = str(pending.get("order_id") or "")
        expected_perm_id = str(pending.get("order_perm_id") or "")
        expected_ref = str(pending.get("order_ref") or "").upper().strip()
        matches = []
        for trade in known_trades:
            order = getattr(trade, "order", None)
            order_id = str(getattr(order, "orderId", "") or "")
            perm_id = str(getattr(order, "permId", "") or "")
            order_ref = str(getattr(order, "orderRef", "") or "").upper().strip()
            if (
                (expected_perm_id and perm_id == expected_perm_id)
                or (not expected_perm_id and expected_order_id and order_id == expected_order_id)
                or (
                    not expected_perm_id
                    and not expected_order_id
                    and expected_ref
                    and order_ref == expected_ref
                )
            ):
                matches.append(trade)

        if len(matches) == 1 and callable(trade_status):
            status = str(trade_status(matches[0]) or "").lower().strip()
            terminal_bad = {
                str(value).lower()
                for value in getattr(core, "ORDER_BAD_STATUSES", set())
            }
            # Filled + broker-flat + no managed row/open order means the old
            # entry lifecycle has already completed (for example target/manual
            # flat followed by reconciliation). A canceled/rejected parent is
            # likewise safe to release.
            if status == "filled" or status in terminal_bad:
                pending_smi_entries.pop(symbol, None)
                return None

        return _blocked(
            data,
            blocked_status,
            blocked_message,
            pending_setup_id=str(pending.get("setup_id") or ""),
            pending_order_id=pending.get("order_id", ""),
            pending_history_matches=len(matches),
        )

'''
text = text[:start] + new_helper + text[end:]

old_entry = '''                if signal in ("BUY", "SELL"):
                    guard = await _smi_entry_guard(core, data)
                    if guard is not None:
                        return guard

                    result = await core.place_entry_order(data)
'''
new_entry = '''                if signal in ("BUY", "SELL"):
                    pending_guard = await pending_smi_ownership_block(data)
                    if pending_guard is not None:
                        return pending_guard
                    guard = await _smi_entry_guard(core, data)
                    if guard is not None:
                        return guard

                    result = await core.place_entry_order(data)
'''
if text.count(old_entry) != 1:
    raise SystemExit("adapter: SMI entry block marker missing/ambiguous")
text = text.replace(old_entry, new_entry, 1)

old_pending = '''                    if accepted and not bool(result.get("dry_run")):
                        pending_smi_symbols.add(symbol)
                    if accepted and bool(result.get("entry_filled")):
'''
new_pending = '''                    if accepted and not bool(result.get("dry_run")):
                        pending_smi_entries[symbol] = {
                            "setup_id": _text(data, "setup_id"),
                            "order_id": result.get("order_id", ""),
                            "order_perm_id": result.get("order_perm_id", ""),
                            "order_ref": result.get("order_ref", ""),
                            "target_order_id": result.get("target_order_id", ""),
                        }
                    if accepted and bool(result.get("entry_filled")):
'''
if text.count(old_pending) != 1:
    raise SystemExit("adapter: pending SMI set marker missing/ambiguous")
text = text.replace(old_pending, new_pending, 1)

old_prepared = '''                prepared = await _prepare_smi_exit(core, data, row)
                if prepared is not None:
                    return prepared

                result = await core.close_position_market(data)

                partial_qty = float(data.pop("_smi_partial_target_filled_qty", 0.0) or 0.0)
'''
new_prepared = '''                prepared = await _prepare_smi_exit(core, data, row)
                if prepared is not None:
                    prepared_position = prepared.get(
                        "position_after_target_resolution",
                        prepared.get("position_before_close", ""),
                    )
                    try:
                        prepared_flat = abs(float(prepared_position)) <= 0.000001
                    except Exception:
                        prepared_flat = False
                    if prepared_flat:
                        pending_smi_entries.pop(symbol, None)
                    return prepared

                result = await core.close_position_market(data)
                if bool(result.get("close_filled")):
                    position_after_close = await core.get_position_size(symbol)
                    if abs(float(position_after_close or 0.0)) <= 0.000001:
                        pending_smi_entries.pop(symbol, None)

                partial_qty = float(data.pop("_smi_partial_target_filled_qty", 0.0) or 0.0)
'''
if text.count(old_prepared) != 1:
    raise SystemExit("adapter: exit result marker missing/ambiguous")
text = text.replace(old_prepared, new_prepared, 1)

adapter.write_text(text, encoding="utf-8")


# Add an explicit submitted-awaiting-fill race regression. No position and no
# openTrades evidence is intentionally exposed, so only the accepted reservation
# can stop the second concurrent SETUP.
test_path = Path("tests/test_smi_forward_concurrency.py")
test_text = test_path.read_text(encoding="utf-8")
insert_before = '''async def test_foreign_payload_cannot_pass_mid_smi_entry():
'''
new_test = '''class AwaitingFillRaceCore(RaceCore):
    async def place_entry_order(self, data):
        self.entry_calls += 1
        self.entry_started.set()
        await self.entry_release.wait()
        return {
            "status": "submitted_awaiting_entry_fill",
            "entry_filled": False,
            "dry_run": False,
            "order_id": 901,
            "order_perm_id": 1901,
            "order_ref": "TVFVG_AAPL_LONG",
            "target_order_id": 902,
        }


async def test_submitted_awaiting_fill_reservation_blocks_duplicate():
    core = AwaitingFillRaceCore()
    smi.install_smi_forward_adapter(core)
    first, second = await asyncio.gather(
        core.handle_ib_action(smi_entry()),
        core.handle_ib_action(smi_entry()),
    )
    assert core.entry_calls == 1, "accepted unfilled SMI entry must reserve the symbol before a duplicate can submit"
    statuses = {first["status"], second["status"]}
    assert "submitted_awaiting_entry_fill" in statuses
    assert "smi_entry_blocked_pending_broker_ownership" in statuses


async def test_foreign_payload_cannot_pass_mid_smi_entry():
'''
if test_text.count(insert_before) != 1:
    raise SystemExit("concurrency test insertion marker missing/ambiguous")
test_text = test_text.replace(insert_before, new_test, 1)

old_run = '''async def run_tests():
    await test_duplicate_smi_is_serialized()
    await test_foreign_payload_cannot_pass_mid_smi_entry()
'''
new_run = '''async def run_tests():
    await test_duplicate_smi_is_serialized()
    await test_submitted_awaiting_fill_reservation_blocks_duplicate()
    await test_foreign_payload_cannot_pass_mid_smi_entry()
'''
if test_text.count(old_run) != 1:
    raise SystemExit("concurrency run_tests marker missing/ambiguous")
test_path.write_text(test_text.replace(old_run, new_run, 1), encoding="utf-8")


# Document that an accepted-but-unfilled order is reserved rather than inferred
# from a possibly lagging open-orders snapshot.
handbook = Path("docs/VECO_DEVELOPER_HANDBOOK.md")
handbook_text = handbook.read_text(encoding="utf-8")
old_doc = '''SMI ownership is symbol-safe and fail-closed. Entry is refused when TWS already has
a position, bridge managed state, or working orders for the symbol. An SMI exit must
'''
new_doc = '''SMI ownership is symbol-safe and fail-closed. Entry is refused when TWS already has
a position, bridge managed state, or working orders for the symbol. An accepted but
not-yet-filled SMI entry also reserves the symbol in-process until its exact broker
entry reaches a proven terminal state, so a lagging open-orders snapshot cannot admit
a duplicate SETUP. An SMI exit must
'''
if handbook_text.count(old_doc) != 1:
    raise SystemExit("handbook ownership marker missing/ambiguous")
handbook.write_text(handbook_text.replace(old_doc, new_doc, 1), encoding="utf-8")
