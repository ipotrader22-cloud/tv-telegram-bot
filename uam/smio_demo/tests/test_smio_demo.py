"""No browser or broker: exact candidate and per-chart sizing checks."""
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace as N
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from uam_core import load_profile
from tv_automation import AutomationSettings, TradingViewAutomator, TradingViewAutomationError
from smio_demo_contract import validate_candidate, configuration_id

ROOT = Path(__file__).resolve().parents[1]


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "profiles").mkdir()
        (self.root / "Pine").mkdir()
        shutil.copy2(ROOT / "profiles/smio_rsi_demo.json", self.root / "profiles")
        shutil.copy2(ROOT / "Pine/SMIO_RSI_Research_v0_1_UAM_Demo.pine", self.root / "Pine")
        self.path = self.root / "profiles/smio_rsi_demo.json"
        self.profile = load_profile(self.path)
        params = {"SmioFastPeriod": 20, "SmioSlowPeriod": 5, "SmioSignalPeriod": 5,
                  "RsiPeriod": 2, "AllowLong": True, "AllowShort": True,
                  "EmaFastPeriod": 8, "EmaMidPeriod": 21, "EmaSlowPeriod": 200,
                  "TargetMode": "ATR", "AtrTargetMultiplier": 1.0, "SessionMode": "Stocks RTH",
                  "FlattenStocksAtRthEnd": True, "ResearchStartingCapital": 1000000,
                  "CapitalAllocationPercent": 10}
        self.winner = N(params=params, contract_id=self.profile.contract_id, symbol="APA", timeframe=45,
                        alert_name=self.profile.make_alert_name("APA", 45), source_file="offline.xlsx", source_sheet="Sheet1", source_row=2)
        self.winner.tv_inputs = self.profile.build_tv_inputs(params, "APA", self.winner.alert_name)

    def tearDown(self): self.tmp.cleanup()

    def test_configuration_and_sizing_fail_closed(self):
        validate_candidate(self.profile, self.winner)
        self.assertEqual(configuration_id(self.winner), "PINE01:20:5:5:2:true:true:8:21:200:ATR:1:Stocks RTH:true")
        self.winner.params["ResearchStartingCapital"] = 100000
        with self.assertRaises(ValueError): validate_candidate(self.profile, self.winner)

    def test_pine_changes_are_only_title_and_transport_marker(self):
        original = (ROOT / "Pine/SMIO_RSI_Research_v0_1_Paper.pine").read_text(encoding="utf-8")
        demo = (ROOT / "Pine/SMIO_RSI_Research_v0_1_UAM_Demo.pine").read_text(encoding="utf-8")
        demo = demo.replace("SMIO_RSI Research v0.1 — UAM Demo", "SMIO_RSI Research v0.1 — Paper Payload", 1)
        demo = "".join(line for line in demo.splitlines(True) if not line.startswith("demoContract =") and 'experimental_contract' not in line)
        self.assertEqual(demo, original)
        self.winner.params["ResearchStartingCapital"] = 1000000
        self.winner.tv_inputs[0]["value"] = 21
        with self.assertRaises(ValueError): validate_candidate(self.profile, self.winner)

    def test_each_chart_checks_initial_capital_and_order_size(self):
        class Button:
            def click(self): pass
        class Dialog:
            def get_by_role(self, *a, **kw): return Button()
            def get_by_text(self, *a, **kw): return Button()
            def locator(self, *a, **kw): return self
            def filter(self, *a, **kw): return Button()
            def inner_text(self, **kw): return "Order size 10 Percent of equity"
        class Fake(TradingViewAutomator):
            def _open_script_settings(self): pass
            def _settings_dialog(self): return Dialog()
            def _first_visible(self, candidates): return candidates[0]
            def _verify_property_numeric_value(self, dialog, label, expected, *args):
                self.checks.append(label)
                return self.values[label] == expected, []
            def _manual_confirm_strategy_properties(self, *a): raise AssertionError("No manual override for SMIO")
        fake = Fake(AutomationSettings(profile_dir="unused", profile_path=str(self.path)))
        fake._page = N(wait_for_timeout=lambda *a: None, keyboard=N(press=lambda *a: None))
        fake.values = {"Initial capital": 1000000, "Order size": 10}
        fake.checks = []
        fake._verify_strategy_properties_contract()
        fake._verify_strategy_properties_contract()
        self.assertEqual(fake.checks, ["Initial capital", "Order size"] * 2)
        for label in fake.values:
            prior = fake.values[label]
            fake.values[label] = 0
            with self.assertRaises(TradingViewAutomationError): fake._verify_strategy_properties_contract()
            fake.values[label] = prior

    def test_created_snapshot_and_duplicate_protection(self):
        class Fake(TradingViewAutomator):
            def _verify_smio_demo_receivers(self): pass
            def open(self): pass
            def _ensure_script_on_chart(self): pass
            def _set_symbol(self, *a): pass
            def _set_timeframe(self, *a): pass
            def _apply_inputs(self, *a): pass
            def _verify_strategy_properties_contract(self): pass
            def _open_alert_from_script_menu(self): pass
            def _configure_alert_dialog(self, *a): pass
            def _verify_alert_contract_before_create(self, *a): pass
            def _screenshot(self, *a): return "offline"
            def _alert_exists_in_tradingview(self, *a, **kw): return next(self.lookups)
            def _click_create_alert(self): self.clicks += 1
        fake = Fake(AutomationSettings(profile_dir="unused", profile_path=str(self.path)))
        fake.clicks, fake.lookups = 0, iter([False, True, True])
        result = fake.create_alert(self.winner, dry_run=False)
        self.assertEqual(result["status"], "CREATED")
        snapshot = json.loads(next((self.root / "output/smio_snapshots").glob("*.json")).read_text(encoding="utf-8"))
        self.assertEqual(snapshot["status"], "CREATED")
        self.assertTrue(snapshot["properties_verified"])
        self.assertEqual(snapshot["timeframe"], "45")
        self.assertEqual(snapshot["configuration_id"], configuration_id(self.winner))
        self.assertEqual(fake.create_alert(self.winner, dry_run=False)["status"], "EXISTS_NAME_ONLY_UNVERIFIED")
        self.assertEqual(fake.clicks, 1)


if __name__ == "__main__": unittest.main()
