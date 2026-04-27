"""Compatibilidad: ejecutar toda la suite segmentada por archivos."""

from tests.test_faq_flow import *  # noqa: F401,F403
from tests.test_financing_flow import *  # noqa: F401,F403
from tests.test_purchase_flow import *  # noqa: F401,F403
from tests.test_vehicle_catalog_flow import *  # noqa: F401,F403

"""
Cómo correr los tests de forma granular
Desde bot/:

Solo catálogo: python -m unittest tests.test_vehicle_catalog_flow
Solo FAQ: python -m unittest tests.test_faq_flow
Solo compra/imágenes: python -m unittest tests.test_purchase_flow
Solo financiamiento: python -m unittest tests.test_financing_flow
Todo: python -m unittest discover -s tests -p "test_*.py"

El comando completo para correr todos los tests es:
python -m unittest discover -s tests -p "test_*.py"
"""