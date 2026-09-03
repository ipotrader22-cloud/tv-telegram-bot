"""Stable entrypoint for the VECO IB bridge.

The production bridge core is preserved verbatim in ``ib_bridge_core.py``.
Only isolated Engineering adapters are installed here. Non-adapter payloads
continue through the exact pre-existing core handler.
"""

from __future__ import annotations

import sys

try:  # package import in repository/tests
    from . import ib_bridge_core as _core
    from .operator_manual_close_adapter import install_operator_manual_close_adapter
    from .smi_forward_adapter import install_smi_forward_adapter
except ImportError:  # standalone C:\\ib_bridge deployment
    import ib_bridge_core as _core
    from operator_manual_close_adapter import install_operator_manual_close_adapter
    from smi_forward_adapter import install_smi_forward_adapter

install_smi_forward_adapter(_core)
install_operator_manual_close_adapter(_core)

# Imports of bridge.ib_bridge / ib_bridge should receive the patched core module
# itself, preserving existing test monkeypatching and global-state semantics.
if __name__ != "__main__":
    sys.modules[__name__] = _core
else:
    import uvicorn

    uvicorn.run(
        "ib_bridge:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
