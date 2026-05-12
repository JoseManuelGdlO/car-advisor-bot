# Suite de tests del bot (`bot/tests/`)

Guía de propósito de cada módulo de prueba y cómo ejecutarlos. Para la arquitectura del grafo y los nodos, ver [files.md](files.md) y [architecture.md](architecture.md).

## Cómo ejecutar

Desde el directorio `bot/` (donde `src` es importable), con dependencias instaladas (`pip install -r requirements.txt`; se suele usar un virtualenv en `bot/.venv/`, ya listado en `bot/.gitignore`):

```bash
pytest tests/
```

Alternativa con unittest:

```bash
python -m unittest discover -s tests -p "test_*.py"
```

Un solo módulo:

```bash
python -m unittest tests.test_vehicle_catalog_flow
```

Las variables de entorno se fusionan al importar el paquete `tests` (ver `tests/__init__.py`): se cargan `bot/.env` y el `.env` del repo padre si existen, sin sobrescribir valores ya definidos en el entorno.

`conftest.py` añade separadores visibles en la salida de pytest por test (útil al depurar fallos en CI o local).

## Índice por archivo

### `test_helpers.py`

**Rol:** utilidades compartidas, no contiene casos de prueba ejecutables por sí solo.

**Contenido:** `build_graph()`, `initial_state()` (alineado con `clientState`), `with_user_message()`, clase base `GraphTestCase`.

---

### `test_bot_settings_cache.py`

**Rol:** unitario — caché en memoria de ajustes del bot (`get_bot_settings` en `src.tools.database`).

**Cubre:** segunda llamada dentro del TTL evita HTTP; copia superficial devuelta al cliente; TTL cero no cachea; fallo HTTP no llena caché; expiración de TTL dispara nueva petición.

---

### `test_vehicle_catalog_flow.py`

**Rol:** integración — flujo de catálogo y primer contacto con promociones.

**Cubre:** respuestas “answer-first” con variantes de intent del router; solicitud de promociones desde el inicio; detalle de vehículo con/sin imágenes; multiturno saludo → modelos → selección → datos; filtros por rango de precio; cambio a “otros vehículos” durante confirmación de compra; smoke mínimo “¿qué carros tienes?”.

**Clases:** `VehicleCatalogFlowTests`, `CarSelectionSmokeTests`.

---

### `test_purchase_flow.py`

**Rol:** integración — confirmación de compra, más imágenes y rutas relacionadas.

**Cubre:** “sí” a compra en el mismo turno hacia `lead_capture`; clasificador de paso para más imágenes con y sin stock; preguntas de precio/modelo/km mientras se espera confirmación; vista de modelo; que “más imágenes” no se desvíe a FAQ en ese contexto.

---

### `test_financing_flow.py`

**Rol:** integración — nodo `financing` y transiciones hacia lead, catálogo o promociones.

**Cubre:** rechazo de planes manteniendo intención de compra; pedido de catálogo desde financiamiento; pedido de promociones (no FAQ); múltiples vehículos hacia lead; escenario multiturno Versa + FAQ + plan + lead.

---

### `test_faq_flow.py`

**Rol:** integración — FAQ y reanudación.

**Cubre:** mensaje de ubicación → `faq`; interrupción FAQ y retorno a `lead_capture` en el siguiente turno; FAQ no interruptiva que deja `intent` en `other`.

---

### `test_lead_capture_summary_correction_flow.py`

**Rol:** integración y unidad ligera sobre `lead_capture`.

**Cubre:** corrección de email tras el resumen y confirmación con creación de lead; `_collect_missing_contact_fields` cuando el email se rellena en el mismo turno.

---

### `test_lead_capture_override_intent.py`

**Rol:** integración — desvíos desde captura de lead.

**Cubre:** override hacia catálogo con intent `vehicle_catalog`; fallo de notificación que aún persiste evento de lead completado.

---

### `test_router_hybrid.py`

**Rol:** unitario — función `router` sin ejecutar el grafo completo.

**Cubre:** `UNKNOWN` + heurística de ubicación → `faq`; `FAQ` del LLM sobrescrito por heurística de financiamiento; saneo de `intent` previo `faq` a `other` antes de llamar al clasificador.

---

### `test_answer_first_contract.py`

**Rol:** integración — contratos de respuesta y prioridad de intención.

**Cubre:** financiamiento responde primero y lista planes; pregunta híbrida (ubicación + Versa) prioriza vehículo → `car_selection` aunque el clasificador devuelva `FAQ`.

---

### `test_car_selection_fallback.py`

**Rol:** unitario — helpers en `src.services.car_selection_fallback` (señales y detección de tipo de mensaje).

**Cubre:** límites de palabra en frases señal; petición general de catálogo; solicitud de año/característica; vehículo específico con dependencias inyectadas; más imágenes / financiamiento / promociones; specs del vehículo seleccionado mismo vs cambio de unidad.

---

### `test_price_filters.py`

**Rol:** unitario — `detect_vehicle_filters` y `search_vehicles` en `src.tools.vehicles`.

**Cubre:** salida del LLM con canonicalización de catálogo; rangos de precio coloquiales, máximo, “hasta”, “desde”; parámetros enviados en la petición HTTP de búsqueda.

---

### `test_formatters.py`

**Rol:** unitario — `src.utils.formatters`.

**Cubre:** nombres de vehículo, opciones numeradas, listas de imágenes; comparación de dos vehículos (web vs WhatsApp); comparación de planes de financiamiento; comparación de promociones (incluye `vehicleLabels`).

---

### `test_promotions_step_flags.py`

**Rol:** unitario — `classify_promotions_step_flags` en `src.services.llm_responses`.

**Cubre:** flags `apply_promotion`, `ask_promotion_vehicle_info`, `ask_promotions` con `ChatOpenAI` sustituido por un LLM dummy determinista.

---

### `test_promotion_pick_resolution.py`

**Rol:** unitario — helpers internos del nodo `promotions` (`_pick_promotion_by_token_overlap`, `_resolve_promotion_from_extract`).

**Cubre:** elección por solapamiento de tokens; resolución por índice o por consulta de título; `no_match`.

---

### `test_tools_vehicles_whatsapp.py`

**Rol:** unitario — herramientas compartidas sin grafo.

**Cubre:** `resolve_single_vehicle_from_text` con preferencia por disponible; `normalize_image_url_for_chat` y `build_whatsapp_image_marker_block` (URLs absolutas, omisión de imágenes vacías).

---
