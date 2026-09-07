from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# Pine: preserve v0.4 and create approved v0.5-FWD research contract.
# -----------------------------------------------------------------------------
old_pine_path = Path("pine/SMI_Histogram_v0_4_FWD_UAM.pine")
new_pine_path = Path("pine/SMI_Histogram_v0_5_FWD_UAM.pine")
old_pine = old_pine_path.read_text(encoding="utf-8")
pine = old_pine

for old, new, label in [
    ('title="SMI Histogram Strategy — v0.4-FWD UAM"', 'title="SMI Histogram Strategy — v0.5-FWD UAM"', 'pine title'),
    ('shorttitle="SMI Hist v0.4-FWD"', 'shorttitle="SMI Hist v0.5-FWD"', 'pine shorttitle'),
    ('Research signal logic below is frozen from SMI Histogram Strategy — Research v0.4.', 'Research signal logic below is frozen from SMI Histogram Strategy — Research v0.5.', 'pine freeze comment'),
    ('Condition: SMI Hist v0.4-FWD', 'Condition: SMI Hist v0.5-FWD', 'pine alert condition comment'),
    ('const string UAM_STRATEGY_ID = "SMI_HISTOGRAM_V0_4_FWD"', 'const string UAM_STRATEGY_ID = "SMI_HISTOGRAM_V0_5_FWD"', 'pine strategy id'),
    ('const string UAM_RESEARCH_VERSION = "0.4-FWD"', 'const string UAM_RESEARCH_VERSION = "0.5-FWD"', 'pine research version'),
]:
    pine = replace_once(pine, old, new, label)

ema_input_anchor = '''emaLen = input.int(
     200,
     "EMA Length",
     minval=1,
     group="MTF EMA Filter"
)

// ============================================================================
// INDICATORS
'''
ema_input_replacement = '''emaLen = input.int(
     200,
     "EMA Length",
     minval=1,
     group="MTF EMA Filter"
)

// ============================================================================
// EMA 8/21/50 STACK FILTER
// ============================================================================

useEmaStackFilter = input.bool(
     false,
     "Enable 8/21/50 EMA Filter",
     group="EMA Stack Filter"
)

// ============================================================================
// INDICATORS
'''
pine = replace_once(pine, ema_input_anchor, ema_input_replacement, 'pine EMA toggle input')

indicator_anchor = '''// ATR period intentionally hard coded.
atr14 = ta.atr(14)

// ============================================================================
// HISTOGRAM DIRECTION
'''
indicator_replacement = '''// ATR period intentionally hard coded.
atr14 = ta.atr(14)

// Trading Lab-approved same-timeframe EMA stack filter.
// Lengths are frozen at 8 / 21 / 50 for v0.5-FWD.
ema8 = ta.ema(close, 8)
ema21 = ta.ema(close, 21)
ema50 = ta.ema(close, 50)

// ============================================================================
// HISTOGRAM DIRECTION
'''
pine = replace_once(pine, indicator_anchor, indicator_replacement, 'pine EMA calculations')

mtf_anchor = '''shortMtfOK =
     not useMtfFilter or
     bearVotes >= 3

// ============================================================================
// UAM / VECO SERIALIZATION HELPERS — ENGINEERING ONLY, NO SIGNAL LOGIC
'''
mtf_replacement = '''shortMtfOK =
     not useMtfFilter or
     bearVotes >= 3

// ============================================================================
// EMA 8/21/50 STACK FILTER
// Trading Lab v0.5-FWD freeze:
// LONG  -> confirmed close above EMA 8, EMA 21, and EMA 50
// SHORT -> confirmed close below EMA 8, EMA 21, and EMA 50
// Disabled -> no additional entry restriction.
// ============================================================================

longEmaStackOK =
     not useEmaStackFilter or
     (close > ema8 and close > ema21 and close > ema50)

shortEmaStackOK =
     not useEmaStackFilter or
     (close < ema8 and close < ema21 and close < ema50)

// ============================================================================
// UAM / VECO SERIALIZATION HELPERS — ENGINEERING ONLY, NO SIGNAL LOGIC
'''
pine = replace_once(pine, mtf_anchor, mtf_replacement, 'pine EMA entry gate')

payload_anchor = '''    j += "\\\"bear_votes\\\":" + str.tostring(bearVotes) + ","
    j += "\\\"eod_close_enabled\\\":" + str.tostring(useEodClose) + ","
'''
payload_replacement = '''    j += "\\\"bear_votes\\\":" + str.tostring(bearVotes) + ","
    j += "\\\"ema_stack_filter_enabled\\\":" + str.tostring(useEmaStackFilter) + ","
    j += "\\\"ema8\\\":" + f_json_num(ema8) + ","
    j += "\\\"ema21\\\":" + f_json_num(ema21) + ","
    j += "\\\"ema50\\\":" + f_json_num(ema50) + ","
    j += "\\\"long_ema_stack_ok\\\":" + str.tostring(longEmaStackOK) + ","
    j += "\\\"short_ema_stack_ok\\\":" + str.tostring(shortEmaStackOK) + ","
    j += "\\\"eod_close_enabled\\\":" + str.tostring(useEodClose) + ","
'''
pine = replace_once(pine, payload_anchor, payload_replacement, 'pine EMA payload diagnostics')

long_condition_anchor = '''     not eodBlocked and
     longMtfOK and
     rawLongTrigger and
'''
long_condition_replacement = '''     not eodBlocked and
     longMtfOK and
     longEmaStackOK and
     rawLongTrigger and
'''
pine = replace_once(pine, long_condition_anchor, long_condition_replacement, 'pine long EMA condition')

short_condition_anchor = '''     not eodBlocked and
     shortMtfOK and
     rawShortTrigger and
'''
short_condition_replacement = '''     not eodBlocked and
     shortMtfOK and
     shortEmaStackOK and
     rawShortTrigger and
'''
pine = replace_once(pine, short_condition_anchor, short_condition_replacement, 'pine short EMA condition')

data_window_anchor = '''plot(
     bearVotes,
     title="MTF Bear Votes",
     display=display.data_window
)

plot(
     cycleDirection,
'''
data_window_replacement = '''plot(
     bearVotes,
     title="MTF Bear Votes",
     display=display.data_window
)

plot(
     ema8,
     title="EMA 8",
     display=display.data_window
)

plot(
     ema21,
     title="EMA 21",
     display=display.data_window
)

plot(
     ema50,
     title="EMA 50",
     display=display.data_window
)

plot(
     useEmaStackFilter ? 1 : 0,
     title="EMA 8/21/50 Filter Enabled",
     display=display.data_window
)

plot(
     cycleDirection,
'''
pine = replace_once(pine, data_window_anchor, data_window_replacement, 'pine EMA data-window diagnostics')

if new_pine_path.exists():
    existing = new_pine_path.read_text(encoding="utf-8")
    if existing != pine:
        raise RuntimeError("existing v0.5 Pine differs from generated contract")
else:
    new_pine_path.write_text(pine, encoding="utf-8")

if old_pine_path.read_text(encoding="utf-8") != old_pine:
    raise RuntimeError("v0.4 Pine was modified; aborting")

# -----------------------------------------------------------------------------
# Render: accept exact v0.4 and v0.5 SMI strategy/research pairs.
# -----------------------------------------------------------------------------
app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")

constants_old = '''const SMI_FWD_SYSTEM_ID = 'VIXALE_SMI_FWD';
const SMI_FWD_STRATEGY_ID = 'SMI_HISTOGRAM_V0_4_FWD';
const SMI_FWD_RESEARCH_VERSION = '0.4-FWD';
const SMI_FWD_POSITION_SIZE_PCT = 3;
const SMI_FWD_QTY_SOURCE = 'TV Strategy Properties';
'''
constants_new = '''const SMI_FWD_SYSTEM_ID = 'VIXALE_SMI_FWD';
const SMI_FWD_STRATEGY_CONTRACTS = new Map([
  ['SMI_HISTOGRAM_V0_4_FWD', '0.4-FWD'],
  ['SMI_HISTOGRAM_V0_5_FWD', '0.5-FWD'],
]);
// Backward-compatible aliases used by older tests/helpers. New validation is
// driven by the exact strategy/research pair in SMI_FWD_STRATEGY_CONTRACTS.
const SMI_FWD_STRATEGY_ID = 'SMI_HISTOGRAM_V0_4_FWD';
const SMI_FWD_RESEARCH_VERSION = '0.4-FWD';
const SMI_FWD_POSITION_SIZE_PCT = 3;
const SMI_FWD_QTY_SOURCE = 'TV Strategy Properties';

function smiForwardExpectedResearchVersion(strategyId) {
  return SMI_FWD_STRATEGY_CONTRACTS.get(String(strategyId || '').trim().toUpperCase()) || '';
}
'''
app = replace_once(app, constants_old, constants_new, 'app SMI version contracts')

identity_old = '''  const timeframe = String(data.timeframe || '').trim();
  const side = String(data.side || '').trim().toUpperCase();
  const parts = setupId.split(':');
  if (parts.length !== 5) return false;
  if (parts[0] !== SMI_FWD_STRATEGY_ID) return false;
'''
identity_new = '''  const timeframe = String(data.timeframe || '').trim();
  const side = String(data.side || '').trim().toUpperCase();
  const strategyId = String(data.strategy_id || '').trim().toUpperCase();
  const parts = setupId.split(':');
  if (!smiForwardExpectedResearchVersion(strategyId)) return false;
  if (parts.length !== 5) return false;
  if (parts[0] !== strategyId) return false;
'''
app = replace_once(app, identity_old, identity_new, 'app SMI setup identity')

callback_old = '''  const qty = Number(data.qty);
  return Boolean(
    String(data.strategy_id || '').trim().toUpperCase() === SMI_FWD_STRATEGY_ID &&
    String(data.strategy || '').trim().toUpperCase() === SMI_FWD_STRATEGY_ID &&
    String(data.research_version || '').trim().toUpperCase() === SMI_FWD_RESEARCH_VERSION &&
'''
callback_new = '''  const qty = Number(data.qty);
  const strategyId = String(data.strategy_id || '').trim().toUpperCase();
  const expectedResearchVersion = smiForwardExpectedResearchVersion(strategyId);
  return Boolean(
    expectedResearchVersion &&
    String(data.strategy || '').trim().toUpperCase() === strategyId &&
    String(data.research_version || '').trim().toUpperCase() === expectedResearchVersion &&
'''
app = replace_once(app, callback_old, callback_new, 'app SMI callback identity')

validate_old = '''  if (String(data.strategy_id || '').trim().toUpperCase() !== SMI_FWD_STRATEGY_ID) {
    return { ok: false, reason: 'SMI strategy_id mismatch' };
  }
  if (String(data.strategy || '').trim().toUpperCase() !== SMI_FWD_STRATEGY_ID) {
    return { ok: false, reason: 'SMI strategy mismatch' };
  }
  if (String(data.research_version || '').trim().toUpperCase() !== SMI_FWD_RESEARCH_VERSION) {
    return { ok: false, reason: 'SMI research_version mismatch' };
  }
'''
validate_new = '''  const strategyId = String(data.strategy_id || '').trim().toUpperCase();
  const expectedResearchVersion = smiForwardExpectedResearchVersion(strategyId);
  if (!expectedResearchVersion) {
    return { ok: false, reason: 'SMI strategy_id mismatch' };
  }
  if (String(data.strategy || '').trim().toUpperCase() !== strategyId) {
    return { ok: false, reason: 'SMI strategy mismatch' };
  }
  if (String(data.research_version || '').trim().toUpperCase() !== expectedResearchVersion) {
    return { ok: false, reason: 'SMI research_version mismatch' };
  }
'''
app = replace_once(app, validate_old, validate_new, 'app SMI transport identity validation')

setup_expected_old = '''    const expectedSetupId = `${SMI_FWD_STRATEGY_ID}:${normalizeSymbol(data.symbol)}:${String(data.timeframe || '').trim()}:${side}:${signalBarTime}`;
'''
setup_expected_new = '''    const expectedSetupId = `${strategyId}:${normalizeSymbol(data.symbol)}:${String(data.timeframe || '').trim()}:${side}:${signalBarTime}`;
'''
app = replace_once(app, setup_expected_old, setup_expected_new, 'app SMI canonical setup id')

app_path.write_text(app, encoding="utf-8")

# -----------------------------------------------------------------------------
# Local bridge: same execution family, exact supported strategy/research pairs.
# -----------------------------------------------------------------------------
adapter_path = Path("bridge/smi_forward_adapter.py")
adapter = adapter_path.read_text(encoding="utf-8")

adapter = replace_once(
    adapter,
    '"""SMI Histogram v0.4-FWD execution adapter.',
    '"""SMI Histogram forward-test execution adapter (v0.4-FWD / v0.5-FWD).',
    'adapter docstring version',
)

adapter_constants_old = '''SMI_SYSTEM_ID = "VIXALE_SMI_FWD"
SMI_STRATEGY_ID = "SMI_HISTOGRAM_V0_4_FWD"
SMI_RESEARCH_VERSION = "0.4-FWD"
SMI_POSITION_SIZE_PCT = 3.0
'''
adapter_constants_new = '''SMI_SYSTEM_ID = "VIXALE_SMI_FWD"
SMI_STRATEGY_CONTRACTS = {
    "SMI_HISTOGRAM_V0_4_FWD": "0.4-FWD",
    "SMI_HISTOGRAM_V0_5_FWD": "0.5-FWD",
}
# Backward-compatible aliases for existing v0.4 tests/runtime references.
SMI_STRATEGY_ID = "SMI_HISTOGRAM_V0_4_FWD"
SMI_RESEARCH_VERSION = "0.4-FWD"
SMI_POSITION_SIZE_PCT = 3.0
'''
adapter = replace_once(adapter, adapter_constants_old, adapter_constants_new, 'adapter SMI version contracts')

helper_anchor = '''def is_smi_forward_payload(data: Dict[str, Any]) -> bool:
    """Claim only the exact Engineering-owned SMI execution family."""
    return isinstance(data, dict) and _upper(data, "system_id") == SMI_SYSTEM_ID


'''
helper_replacement = '''def is_smi_forward_payload(data: Dict[str, Any]) -> bool:
    """Claim only the exact Engineering-owned SMI execution family."""
    return isinstance(data, dict) and _upper(data, "system_id") == SMI_SYSTEM_ID


def smi_expected_research_version(strategy_id: Any) -> str:
    return SMI_STRATEGY_CONTRACTS.get(str(strategy_id or "").strip().upper(), "")


def is_supported_smi_strategy(strategy_id: Any) -> bool:
    return bool(smi_expected_research_version(strategy_id))


'''
adapter = replace_once(adapter, helper_anchor, helper_replacement, 'adapter SMI helpers')

blocked_old = '        "strategy_id": SMI_STRATEGY_ID,\n'
blocked_new = '        "strategy_id": _upper(data, "strategy_id") or SMI_STRATEGY_ID,\n'
adapter = replace_once(adapter, blocked_old, blocked_new, 'adapter blocked strategy identity')

expected_old = '''        [
            SMI_STRATEGY_ID,
            _upper(data, "symbol"),
'''
expected_new = '''        [
            _upper(data, "strategy_id"),
            _upper(data, "symbol"),
'''
adapter = replace_once(adapter, expected_old, expected_new, 'adapter expected setup id')

managed_old = '    return strategy == SMI_STRATEGY_ID\n'
managed_new = '    return is_supported_smi_strategy(strategy)\n'
adapter = replace_once(adapter, managed_old, managed_new, 'adapter managed strategy family')

validate_adapter_old = '''    if _upper(data, "strategy_id") != SMI_STRATEGY_ID:
        return _blocked(data, "smi_contract_strategy_id_mismatch", "SMI strategy_id mismatch.")
    if _upper(data, "strategy") != SMI_STRATEGY_ID:
        return _blocked(data, "smi_contract_strategy_mismatch", "SMI strategy transport identity mismatch.")
    if _upper(data, "research_version") != SMI_RESEARCH_VERSION:
        return _blocked(data, "smi_contract_research_version_mismatch", "SMI research version mismatch.")
'''
validate_adapter_new = '''    strategy_id = _upper(data, "strategy_id")
    expected_research_version = smi_expected_research_version(strategy_id)
    if not expected_research_version:
        return _blocked(data, "smi_contract_strategy_id_mismatch", "SMI strategy_id mismatch.")
    if _upper(data, "strategy") != strategy_id:
        return _blocked(data, "smi_contract_strategy_mismatch", "SMI strategy transport identity mismatch.")
    if _upper(data, "research_version") != expected_research_version.upper():
        return _blocked(data, "smi_contract_research_version_mismatch", "SMI research version mismatch.")
'''
adapter = replace_once(adapter, validate_adapter_old, validate_adapter_new, 'adapter transport identity validation')
adapter_path.write_text(adapter, encoding="utf-8")

# -----------------------------------------------------------------------------
# PR #69 runtime safety: preserve exact managed SMI version in EOD watchdog.
# -----------------------------------------------------------------------------
runtime_path = Path("bridge/smi_runtime_safety.py")
runtime = runtime_path.read_text(encoding="utf-8")
runtime = replace_once(
    runtime,
    '"""Runtime safety layer for SMI Histogram v0.4-FWD.',
    '"""Runtime safety layer for supported SMI Histogram forward-test versions.',
    'runtime docstring version',
)
runtime = replace_once(
    runtime,
    '    return system_id == smi.SMI_SYSTEM_ID and strategy == smi.SMI_STRATEGY_ID\n',
    '    return system_id == smi.SMI_SYSTEM_ID and smi.is_supported_smi_strategy(strategy)\n',
    'runtime managed strategy family',
)
watchdog_intro_old = '''    side = str(row.get("side") or payload.get("side") or "").upper().strip()
    setup_id = str(row.get("setup_id") or payload.get("setup_id") or "").strip()
    qty = int(abs(position))

    data = dict(payload)
'''
watchdog_intro_new = '''    side = str(row.get("side") or payload.get("side") or "").upper().strip()
    setup_id = str(row.get("setup_id") or payload.get("setup_id") or "").strip()
    strategy_id = str(
        row.get("strategy_id")
        or row.get("strategy")
        or payload.get("strategy_id")
        or payload.get("strategy")
        or ""
    ).upper().strip()
    research_version = smi.smi_expected_research_version(strategy_id)
    qty = int(abs(position))

    data = dict(payload)
'''
runtime = replace_once(runtime, watchdog_intro_old, watchdog_intro_new, 'runtime watchdog strategy identity')
watchdog_fields_old = '''        "system_id": smi.SMI_SYSTEM_ID,
        "strategy": smi.SMI_STRATEGY_ID,
        "strategy_id": smi.SMI_STRATEGY_ID,
        "research_version": smi.SMI_RESEARCH_VERSION,
'''
watchdog_fields_new = '''        "system_id": smi.SMI_SYSTEM_ID,
        "strategy": strategy_id,
        "strategy_id": strategy_id,
        "research_version": research_version,
'''
runtime = replace_once(runtime, watchdog_fields_old, watchdog_fields_new, 'runtime watchdog version fields')
runtime_path.write_text(runtime, encoding="utf-8")

# -----------------------------------------------------------------------------
# New focused contract tests.
# -----------------------------------------------------------------------------
Path("tests/test_smi_v05_pine_contract.py").write_text(r'''from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
V04 = ROOT / "pine" / "SMI_Histogram_v0_4_FWD_UAM.pine"
V05 = ROOT / "pine" / "SMI_Histogram_v0_5_FWD_UAM.pine"


def run_tests():
    old = V04.read_text(encoding="utf-8")
    text = V05.read_text(encoding="utf-8")

    assert 'SMI Hist v0.4-FWD' in old
    assert 'Enable 8/21/50 EMA Filter' not in old, "v0.4 freeze must remain untouched"

    assert 'SMI Hist v0.5-FWD' in text
    assert 'const string UAM_STRATEGY_ID = "SMI_HISTOGRAM_V0_5_FWD"' in text
    assert 'const string UAM_RESEARCH_VERSION = "0.5-FWD"' in text
    assert 'useEmaStackFilter = input.bool(' in text
    assert 'false,\n     "Enable 8/21/50 EMA Filter"' in text
    assert 'ema8 = ta.ema(close, 8)' in text
    assert 'ema21 = ta.ema(close, 21)' in text
    assert 'ema50 = ta.ema(close, 50)' in text
    assert '(close > ema8 and close > ema21 and close > ema50)' in text
    assert '(close < ema8 and close < ema21 and close < ema50)' in text
    assert 'longMtfOK and\n     longEmaStackOK and\n     rawLongTrigger' in text
    assert 'shortMtfOK and\n     shortEmaStackOK and\n     rawShortTrigger' in text
    assert r'\"ema_stack_filter_enabled\":' in text
    assert r'\"ema8\":' in text
    assert r'\"ema21\":' in text
    assert r'\"ema50\":' in text

    assert 'default_qty_type=strategy.percent_of_equity' in text
    assert 'default_qty_value=3' in text
    assert 'strategy.default_entry_qty(_price)' in text
    assert 'atr14 = ta.atr(14)' in text
    assert '"EXIT_LONG",\n         "CLOSE_STOP",\n         "LONG"' in text
    assert '"EXIT_SHORT",\n         "CLOSE_STOP",\n         "SHORT"' in text

    print("SMI v0.5 Pine EMA-stack contract tests passed")


if __name__ == "__main__":
    run_tests()
''', encoding="utf-8")

Path("tests/test_smi_v05_transport.py").write_text(r'''from bridge import smi_forward_adapter as smi


def payload(strategy_id="SMI_HISTOGRAM_V0_5_FWD", research_version="0.5-FWD"):
    return {
        "source": "TradingView",
        "system_id": "VIXALE_SMI_FWD",
        "strategy": strategy_id,
        "strategy_id": strategy_id,
        "research_version": research_version,
        "sec_type": "STK",
        "position_size_pct": 3,
        "qty_source": "TV Strategy Properties",
        "qty": 30,
        "signal": "BUY",
        "event": "SETUP",
        "symbol": "AAPL",
        "timeframe": "60",
        "side": "LONG",
        "signal_bar_time": 1788379200000,
        "setup_id": f"{strategy_id}:AAPL:60:LONG:1788379200000",
        "entry": 100,
        "target": 102,
        "entry_order_type": "MARKET",
        "target_tif": "GTC",
    }


def run_tests():
    v05 = payload()
    assert smi.validate_smi_transport_contract(v05) is None
    assert smi.is_supported_smi_strategy("SMI_HISTOGRAM_V0_5_FWD")
    assert smi.smi_expected_research_version("SMI_HISTOGRAM_V0_5_FWD") == "0.5-FWD"
    assert smi._expected_setup_id(v05) == v05["setup_id"]
    assert smi._managed_row_is_smi({
        "system_id": "VIXALE_SMI_FWD",
        "strategy_id": "SMI_HISTOGRAM_V0_5_FWD",
    })

    mismatch = payload(research_version="0.4-FWD")
    assert smi.validate_smi_transport_contract(mismatch)["status"] == "smi_contract_research_version_mismatch"

    v04 = payload("SMI_HISTOGRAM_V0_4_FWD", "0.4-FWD")
    assert smi.validate_smi_transport_contract(v04) is None, "v0.4 backward compatibility must remain"

    print("SMI v0.5 bridge transport contract tests passed")


if __name__ == "__main__":
    run_tests()
''', encoding="utf-8")

Path("tests/test_smi_v05_render_integration.js").write_text(r'''\'use strict\';

const assert = require('assert');
const Module = require('module');

process.env.BRIDGE_URL = 'http://mock-bridge.test';
process.env.BRIDGE_FORWARD_ENABLED = 'true';
process.env.BRIDGE_DRY_RUN = 'true';
process.env.MAX_BRIDGE_QTY = '1000';

function fakeExpress() {
  return {
    set() {},
    use() {},
    get() {},
    post() {},
    listen() { throw new Error('app.listen must not run in tests'); },
  };
}
fakeExpress.json = fakeExpress.urlencoded = fakeExpress.text = () => (_req, _res, next) => next?.();

const originalLoad = Module._load;
Module._load = function loadWithTestDoubles(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'googleapis') {
    return {
      google: {
        auth: { GoogleAuth: class GoogleAuth {} },
        sheets: () => ({}),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  parseJsonTradingViewAlert,
  validateSmiForwardTransportContract,
  bridgePayload,
  validateBridgePayload,
} = require('../app.js').__test;
Module._load = originalLoad;

function payload(overrides = {}) {
  return {
    source: 'TradingView',
    payload_version: 1,
    schema_version: 2,
    system_id: 'VIXALE_SMI_FWD',
    strategy_id: 'SMI_HISTOGRAM_V0_5_FWD',
    strategy: 'SMI_HISTOGRAM_V0_5_FWD',
    research_version: '0.5-FWD',
    sec_type: 'STK',
    asset_class: 'STOCK',
    signal: 'BUY',
    event: 'SETUP',
    symbol: 'AAPL',
    timeframe: '60',
    side: 'LONG',
    signal_bar_time: 1788379200000,
    setup_id: 'SMI_HISTOGRAM_V0_5_FWD:AAPL:60:LONG:1788379200000',
    entry: 100,
    price: 100,
    target: 102,
    target_tif: 'GTC',
    entry_order_type: 'MARKET',
    qty: 30,
    qty_source: 'TV Strategy Properties',
    position_size_pct: 3,
    ema_stack_filter_enabled: true,
    ema8: 99,
    ema21: 98,
    ema50: 97,
    ...overrides,
  };
}

function run() {
  const v05 = payload();
  const row = parseJsonTradingViewAlert(v05);
  assert.deepStrictEqual(validateSmiForwardTransportContract(v05), { ok: true, reason: 'ok' });
  assert.strictEqual(row.size, 30);
  const bridge = bridgePayload(v05, row);
  assert.strictEqual(validateBridgePayload(bridge, row).ok, true);
  assert.strictEqual(bridge.strategy_id, 'SMI_HISTOGRAM_V0_5_FWD');
  assert.strictEqual(bridge.research_version, '0.5-FWD');

  assert.strictEqual(validateSmiForwardTransportContract(payload({ research_version: '0.4-FWD' })).ok, false);
  assert.strictEqual(validateSmiForwardTransportContract(payload({ strategy_id: 'SMI_HISTOGRAM_V0_4_FWD' })).ok, false);

  const v04 = payload({
    strategy_id: 'SMI_HISTOGRAM_V0_4_FWD',
    strategy: 'SMI_HISTOGRAM_V0_4_FWD',
    research_version: '0.4-FWD',
    setup_id: 'SMI_HISTOGRAM_V0_4_FWD:AAPL:60:LONG:1788379200000',
  });
  assert.deepStrictEqual(validateSmiForwardTransportContract(v04), { ok: true, reason: 'ok' });

  console.log('SMI v0.5 Render integration tests passed');
}

run();
''', encoding="utf-8")

Path("tests/test_smi_v05_runtime_safety.py").write_text(r'''from bridge import smi_forward_adapter as smi
from bridge import smi_runtime_safety as safety


def run_tests():
    row = {
        "system_id": "VIXALE_SMI_FWD",
        "strategy_id": "SMI_HISTOGRAM_V0_5_FWD",
        "side": "LONG",
        "symbol": "AAPL",
        "setup_id": "SMI_HISTOGRAM_V0_5_FWD:AAPL:60:LONG:1788379200000",
        "qty": 30,
        "last_payload": {
            "system_id": "VIXALE_SMI_FWD",
            "strategy": "SMI_HISTOGRAM_V0_5_FWD",
            "strategy_id": "SMI_HISTOGRAM_V0_5_FWD",
            "research_version": "0.5-FWD",
            "side": "LONG",
            "symbol": "AAPL",
            "setup_id": "SMI_HISTOGRAM_V0_5_FWD:AAPL:60:LONG:1788379200000",
            "eod_close_enabled": True,
            "position_size_pct": 3,
            "qty_source": "TV Strategy Properties",
        },
    }
    assert safety._is_exact_smi_managed_row(row)
    watchdog = safety._watchdog_payload(row, 30)
    assert watchdog["strategy_id"] == "SMI_HISTOGRAM_V0_5_FWD"
    assert watchdog["strategy"] == "SMI_HISTOGRAM_V0_5_FWD"
    assert watchdog["research_version"] == "0.5-FWD"
    assert smi.validate_smi_transport_contract({**watchdog, "source": "TradingView"}) is None
    print("SMI v0.5 runtime-safety identity tests passed")


if __name__ == "__main__":
    run_tests()
''', encoding="utf-8")

handbook_path = Path("docs/VECO_DEVELOPER_HANDBOOK.md")
handbook = handbook_path.read_text(encoding="utf-8")
handbook = handbook.replace("**Last updated:** 2026-09-04", "**Last updated:** 2026-09-06", 1)
section_marker = "\n---\n\n## 4. Canonical Production Files"
if handbook.count(section_marker) != 1:
    raise RuntimeError(f"handbook section marker count={handbook.count(section_marker)}")
new_section = r'''

### 3A.2 SMI Histogram v0.5-FWD — optional 8/21/50 EMA stack filter

**Trading Lab research freeze:** `SMI Histogram Strategy v0.5-FWD`  
**Approval date:** 2026-09-06  
**Engineering system ID:** `VIXALE_SMI_FWD`  
**Engineering strategy ID:** `SMI_HISTOGRAM_V0_5_FWD`  
**Canonical Pine:** `/pine/SMI_Histogram_v0_5_FWD_UAM.pine`

Trading Lab approved one strategy-logic addition relative to v0.4-FWD: an optional,
disabled-by-default same-timeframe EMA stack filter with fixed lengths 8 / 21 / 50.
When the toggle `Enable 8/21/50 EMA Filter` is disabled, it adds no entry restriction.
When enabled, a confirmed LONG entry is eligible only when the confirmed bar close is
strictly above EMA 8, EMA 21, and EMA 50; a confirmed SHORT entry is eligible only when
the confirmed bar close is strictly below EMA 8, EMA 21, and EMA 50.

The EMA filter applies only to new entries. It does not alter histogram/TSI calculation,
Zero Cross vs Histogram Tick selection, cycle/re-entry behavior, the existing optional
3-of-5 MTF EMA filter, ATR(14) target calculation or freeze timing, indicator-stop logic,
session/EOD rules, TradingView 3% sizing, signal timing, or broker execution mechanics.

Engineering transport remains execution-first and uses the existing `VIXALE_SMI_FWD`
family. v0.4-FWD remains backward compatible. Render and the local bridge validate the
exact supported strategy/research pairs:

```text
SMI_HISTOGRAM_V0_4_FWD -> 0.4-FWD
SMI_HISTOGRAM_V0_5_FWD -> 0.5-FWD
```

The v0.5 Pine serializes the filter state and EMA values for diagnostics only; Render and
the bridge do not recalculate or reinterpret the EMA filter. UAM may set the approved
checkbox from the frozen winner parameters and must continue to verify TradingView Strategy
Properties sizing at exactly 3%.

v0.5 activation is gated behind the SMI runtime-safety hardening in PR #69. The v0.5
Engineering PR is intentionally stacked on that branch so the allowlist and broker EOD
fail-safe preserve the exact active SMI strategy/research identity. Do not merge/deploy or
create live v0.5 alerts until PR #69's cleanup/merge gate and the v0.5 PR's own verification
and explicit owner approval are complete.
'''
handbook = handbook.replace(section_marker, new_section + section_marker, 1)
handbook_path.write_text(handbook, encoding="utf-8")

for temp in [
    Path(".github/scripts/apply_smi_v05.py"),
    Path(".github/workflows/smi-v05-patch.yml"),
]:
    if temp.exists():
        temp.unlink()

print("SMI v0.5-FWD EMA-stack patch applied successfully")
