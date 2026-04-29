# Guia de archivos del MVP

## `bot/src/state.py`

Define `clientState` con el contrato oficial del estado compartido en LangGraph.
Incluye historial de mensajes, nodo actual, selecciones del usuario y salida para frontend.

## `bot/src/nodes/`

La carpeta de nodos ahora esta separada por responsabilidad:

- `car_selection`: unifica catalogo, filtros y detalle de vehiculos.
- `financing`: manejo de planes financieros y seleccion de vehiculo por plan.
- `promotions`: manejo de promociones y seleccion de vehiculo aplicable.
- `lead_capture`: captura datos del cliente y notifica a asesor.
- `faq`: respuesta corta para preguntas generales.
- `intent_checker`: detecta interrupciones FAQ y marca reanudacion.
- `router`: clasifica intencion principal y enruta el flujo.

## `bot/src/graph.py`

Declara y compila el `StateGraph(clientState)`:

- `START -> intent_checker` como primera validacion de interrupciones.
- `intent_checker` puede enviar a `faq`, retomar nodo previo o continuar a `router`.
- Nodo `router` decide entre `car_selection`, `financing`, `promotions`, `lead_capture`, `faq` o `END`.
- `car_selection`, `financing` y `promotions` tienen transiciones condicionales entre si y/o hacia `lead_capture`.
- `lead_capture` y `faq` finalizan en `END`.

## `bot/src/tools/database.py`

Funciones de persistencia en MySQL:

- `fetch_active_bot_session(user_id, platform)`: obtiene sesion activa y deserializa JSON.
- `upsert_bot_session_state(user_id, state_dict, ...)`: inserta/actualiza estado serializado.
- `delete_bot_session(user_id, platform)`: reinicia sesion persistida.
- `upsert_inbound_user_message(...)` y `push_assistant_message_to_backend(...)`: sincronizacion de mensajes con backend CRM.
- `fetch_financing_plans*` y `fetch_promotions*`: consumo de catalogos remotos de financiamiento/promociones.

Base tomada del modelo `bot_sessions` compartido, sin `company_id`.

## `bot/src/server.py`

API principal:

- `POST /chat`: ciclo completo de lectura de sesion, invocacion del grafo y guardado de estado.
- `POST /reset`: elimina la sesion actual del usuario/plataforma.
- `GET /health`: verificacion basica del servicio.

Modelos Pydantic:

- `ChatRequest`: `user_id`, `message`, `platform`.
- `ChatResponse`: `reply`, `current_node`, `selected_car`.
- `ResetRequest` / `ResetResponse`: contrato para reinicio de sesion.

## Archivos legacy en `bot/`

Se mantienen para compatibilidad y delegan a `src`:

- `bot/graph.py`
- `bot/state.py`
- `bot/nodes.py`
- `bot/main.py`

Esto evita romper comandos existentes mientras la implementacion real vive en `bot/src`.
