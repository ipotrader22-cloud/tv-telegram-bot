from pathlib import Path


path = Path("docs/VECO_DEVELOPER_HANDBOOK.md")
text = path.read_text(encoding="utf-8")

old_date = "**Last updated:** 2026-08-24"
assert text.count(old_date) == 1, "unexpected handbook Last updated marker"
text = text.replace(old_date, "**Last updated:** 2026-09-02", 1)

anchor = """Existing classification and lifecycle must remain backward compatible.

---

## 4. Canonical Production Files
"""

section = """Existing classification and lifecycle must remain backward compatible.

---

## 3A. Forward-Test Engineering Integrations (Not Production)

### 3A.1 SMI Histogram v0.4-FWD

**Research freeze:** `SMI Histogram Strategy v0.4-FWD`  
**Engineering system ID:** `VIXALE_SMI_FWD`  
**Engineering strategy ID:** `SMI_HISTOGRAM_V0_4_FWD`  
**Canonical forward-test Pine:** `/pine/SMI_Histogram_v0_4_FWD_UAM.pine`  
**Repository status:** forward-test integration only; this section is not evidence of merge, deployment, or TWS activation.

Trading Lab owns the frozen research behavior. Engineering must not derive, optimize,
or reinterpret SMI signals, histogram state, cycle rules, MTF votes, stop rules,
ATR targets, session rules, or signal timing. The UAM layer serializes and executes
only an already-valid frozen research event.

The Engineering transport contract is:

```text
BUY        -> SETUP / LONG
SELL       -> SETUP / SHORT
EXIT_LONG  -> CLOSE_STOP / LONG
EXIT_SHORT -> CLOSE_STOP / SHORT
EOD_FLAT   -> EOD_CLOSE / active side
```

Live sizing is owned by TradingView Strategy Properties. The Pine strategy uses
`strategy.percent_of_equity` with `default_qty_value=3`. At the valid entry event,
Pine snapshots the corresponding whole-share quantity from
`strategy.default_entry_qty()` and serializes that integer as `qty` with
`qty_source="TV Strategy Properties"` and `position_size_pct=3`. Render and the
bridge must never recalculate the percentage, substitute `BRIDGE_DEFAULT_QTY`, or
execute a missing/invalid SMI quantity.

The ATR target is calculated and frozen by the approved Pine research event before
transport. Engineering does not recompute ATR or target logic. SMI entries serialize
as broker `MARKET` entries with the frozen positive directional target attached as
`GTC`.

Render treats `VIXALE_SMI_FWD` as an exact execution-first family. It validates the
system/strategy/research identity, stock-only contract, canonical `setup_id`, 3%
quantity provenance, signal/event/side mapping, entry order type, and target TIF.
TradingView entry/close alerts are forwarded to the local bridge first; public
OPEN/CLOSE publication requires broker callback evidence. Missing or inconsistent
execution identity, fill quantity, fill price, target order identity, close order
identity, or broker-flat evidence fails closed.

The local bridge preserves the pre-SMI Prime/Edge implementation in
`/bridge/ib_bridge_core.py`. `/bridge/ib_bridge.py` is a wrapper that installs
`/bridge/smi_forward_adapter.py`; payloads outside `VIXALE_SMI_FWD` delegate to the
pre-existing core unless an active SMI-managed symbol must be protected from a
foreign broker-mutating action.

SMI ownership is symbol-safe and fail-closed. Entry is refused when TWS already has
a position, bridge managed state, or working orders for the symbol. An SMI exit must
match the active managed SMI `setup_id` and side, prove the exact managed target,
and refuse unrelated working orders before any cancellation/market close. Ambiguous
broker state produces no speculative broker action. If a partial target fill and
market remainder create mixed execution evidence, the remaining broker position may
be flattened only after synchronization, while automatic public close publication is
withheld for evidence-safe manual reconciliation.

Promotion remains a separate gate:

```text
Research Freeze v0.4-FWD
-> Engineering/UAM integration
-> regression verification
-> PR
-> explicit merge/deployment approval
-> paper/shadow or forward-test activation as approved
```

No Engineering transport change may silently modify the frozen trading behavior.
Any required strategy-logic change returns to Trading Lab as a new validated version.

---

## 4. Canonical Production Files
"""

assert text.count(anchor) == 1, "unexpected handbook Section 3/4 insertion anchor"
text = text.replace(anchor, section, 1)
path.write_text(text, encoding="utf-8")
print("SMI forward-test handbook contract inserted")
