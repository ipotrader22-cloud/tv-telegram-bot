from pathlib import Path

path = Path("tests/test_smi_forward_bridge_isolation.py")
text = path.read_text(encoding="utf-8")
old = '''    async def place_entry_order(self, data):
        return await self.handle_ib_action(data)

    async def close_position_market(self, data):
        return await self.handle_ib_action(data)
'''
new = '''    async def place_entry_order(self, data):
        self.original_calls.append(dict(data))
        return {
            "status": "delegated",
            "symbol": data.get("symbol"),
            "event": data.get("event"),
            "close_filled": False,
        }

    async def close_position_market(self, data):
        self.original_calls.append(dict(data))
        return {
            "status": "delegated",
            "symbol": data.get("symbol"),
            "event": data.get("event"),
            "close_filled": data.get("event") in {"CLOSE_STOP", "EOD_CLOSE"},
        }
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one recursive fake primitive block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
