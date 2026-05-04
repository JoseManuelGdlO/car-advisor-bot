"""Compatibilidad: agrupa la suite segmentada sin imports comodín.

Cómo correr los tests de forma granular desde bot/:

- Solo catálogo: python -m unittest tests.test_vehicle_catalog_flow
- Solo FAQ: python -m unittest tests.test_faq_flow
- Solo compra/imágenes: python -m unittest tests.test_purchase_flow
- Solo financiamiento: python -m unittest tests.test_financing_flow
- Todo: python -m unittest discover -s tests -p "test_*.py"
"""

from __future__ import annotations

import importlib
import unittest

_AGGREGATED_MODULES = (
    "tests.test_faq_flow",
    "tests.test_financing_flow",
    "tests.test_purchase_flow",
    "tests.test_vehicle_catalog_flow",
)


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    suite = unittest.TestSuite()
    for name in _AGGREGATED_MODULES:
        suite.addTests(loader.loadTestsFromModule(importlib.import_module(name)))
    return suite
