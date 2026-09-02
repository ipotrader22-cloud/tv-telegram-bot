from pathlib import Path

path = Path("tests/test_smi_forward_pine_contract.py")
text = path.read_text(encoding="utf-8")
old = '''    assert '\"BUY\",\\n         \"SETUP\",\\n         \"LONG\"' in text
    assert '\"SELL\",\\n         \"SETUP\",\\n         \"SHORT\"' in text
'''
new = '''    assert '\"BUY\",\\n             \"SETUP\",\\n             \"LONG\"' in text
    assert '\"SELL\",\\n             \"SETUP\",\\n             \"SHORT\"' in text
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one Pine BUY/SELL assertion block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
