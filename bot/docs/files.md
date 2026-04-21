# Guia de archivos del MVP

## `bot/src/state.py`

Define `clientState` con el contrato oficial del estado compartido en LangGraph.
Incluye historial de mensajes, nodo actual, selecciones del usuario y salida para frontend.

## `bot/src/nodes/`

La carpeta de nodos ahora esta separada por responsabilidad:

- `category_selection`: solicita categoria (`SUV`, `Sedan`, `Pickup`).
- `car_selection`: muestra modelos segun categoria elegida.
- `lead_capture`: captura datos del cliente y notifica a asesor.
- `faq`: respuesta corta para preguntas generales.
- `intent_checker`: detecta interrupciones FAQ y marca reanudacion.

Helpers y constantes compartidas:

- `nodes/common.py` centraliza:
  - `safe_llm_format`: usa `ChatOpenAI` solo para mejorar redaccion.
  - `parse_customer_info`: parsea datos en formato JSON o `clave:valor`.
  - `append_assistant_message`: estandariza escritura de respuesta y botones.
  - `CATEGORY_OPTIONS` y `CAR_OPTIONS_BY_CATEGORY`.

## `bot/src/graph.py`

Declara y compila el `StateGraph(clientState)`:

- Nodo `router` decide la siguiente etapa segun estado y ultimo mensaje.
- Edges condicionales conectan hacia `category_selection`, `car_selection`, `lead_capture` o `faq`.
- Cada nodo de negocio termina el turno en `END`.

## `bot/src/tools/database.py`

Funciones de persistencia en MySQL:

- `fetch_active_bot_session(user_id, platform)`: obtiene sesion activa y deserializa JSON.
- `upsert_bot_session_state(user_id, state_dict, ...)`: inserta/actualiza estado serializado.

Base tomada del modelo `bot_sessions` compartido, sin `company_id`.

## `bot/src/server.py`

API principal:

- `POST /chat`: ciclo completo de lectura de sesion, invocacion del grafo y guardado de estado.
- `GET /health`: verificacion basica del servicio.

Modelos Pydantic:

- `ChatRequest`: `user_id`, `message`, `platform`.
- `ChatResponse`: `reply`, `options`, `current_node`, `selected_category`, `selected_car`.

## Archivos legacy en `bot/`

Se mantienen para compatibilidad y delegan a `src`:

- `bot/graph.py`
- `bot/state.py`
- `bot/nodes.py`
- `bot/main.py`

Esto evita romper comandos existentes mientras la implementacion real vive en `bot/src`.
