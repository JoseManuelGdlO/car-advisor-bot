"""Hooks de pytest. El .env se carga en tests/__init__.py (también para unittest)."""

from __future__ import annotations

import pytest

# Import temprano: si pytest carga conftest antes que los módulos de test, aún aplica .env.
import tests  # noqa: F401


def pytest_runtest_setup(item: pytest.Item) -> None:
    if not isinstance(item, pytest.Function):
        return
    tr = item.config.pluginmanager.getplugin("terminalreporter")
    if tr is None:
        return
    tr.write_line("")
    tr.write_sep("=", item.nodeid, fullwidth=True)
