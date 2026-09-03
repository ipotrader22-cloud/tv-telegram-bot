from pathlib import Path


PINE = Path(__file__).resolve().parents[1] / "pine" / "SMI_Histogram_v0_4_FWD_UAM.pine"


def run_tests():
    text = PINE.read_text(encoding="utf-8")

    assert 'default_qty_type=strategy.percent_of_equity' in text
    assert 'default_qty_value=3' in text
    assert 'strategy.fixed' not in text
    assert 'const string UAM_SYSTEM_ID = "VIXALE_SMI_FWD"' in text
    assert 'const string UAM_STRATEGY_ID = "SMI_HISTOGRAM_V0_4_FWD"' in text
    assert 'const string UAM_RESEARCH_VERSION = "0.4-FWD"' in text
    assert 'const float UAM_POSITION_SIZE_PCT = 3.0' in text

    assert 'f_entry_qty(_price) =>' in text
    assert 'strategy.default_entry_qty(_price)' in text
    assert 'math.max(1, math.floor(math.abs(_value)))' not in text
    assert 'na(rawQty) ? 0 : int(math.max(0, math.floor(math.abs(rawQty))))' in text
    assert 'if longEntryQty > 0' in text
    assert 'if shortEntryQty > 0' in text

    target_decl = text.index('var float longTargetPrice = na')
    eod_use = text.index('float eodTarget = strategy.position_size > 0 ? longTargetPrice : shortTargetPrice')
    assert target_decl < eod_use, 'target storage must be declared before EOD serialization uses it'
    assert r'\"qty_source\":\"TV Strategy Properties\"' in text
    assert r'\"position_size_pct\":' in text
    assert r'\"entry_order_type\":\"MARKET\"' in text
    assert r'\"target_tif\":\"GTC\"' in text

    assert '"BUY",\n             "SETUP",\n             "LONG"' in text
    assert '"SELL",\n             "SETUP",\n             "SHORT"' in text
    assert '"EXIT_LONG",\n         "CLOSE_STOP",\n         "LONG"' in text
    assert '"EXIT_SHORT",\n         "CLOSE_STOP",\n         "SHORT"' in text

    # Pine strategy entries intentionally omit explicit qty so Strategy Properties
    # remain the backtest/order-sizing authority; the alert snapshots that same
    # TradingView quantity through strategy.default_entry_qty().
    assert 'strategy.entry(\n         "Long",\n         strategy.long,\n         comment="SMI Hist Long"' in text
    assert 'strategy.entry(\n         "Short",\n         strategy.short,\n         comment="SMI Hist Short"' in text

    print("SMI Pine transport/sizing contract tests passed")


if __name__ == "__main__":
    run_tests()
