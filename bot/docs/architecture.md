# Arquitectura actual: Car Advisor Bot

## Objetivo

El bot implementa un flujo conversacional guiado por estados deterministas sobre LangGraph,
con persistencia de sesion en MySQL y sincronizacion de mensajes hacia el backend CRM.

## Stack

- FastAPI + uvicorn para exponer la API.
- LangGraph (StateGraph) para orquestar nodos de conversacion.
- Langchain OpenAI para clasificacion puntual de intenciones y respuestas controladas.
- MySQL (`mysql-connector-python`) para persistencia de sesion (`bot_sessions`) y FAQ.
- Pydantic para validacion de entrada/salida.
- `python-dotenv` para configuracion por entorno.
- `requests` para integracion con backend Node (`/bot/conversation-events`, settings, catalogos).

## Componentes principales

```mermaid
flowchart TD
    clientApp[Frontend o canal] --> chatApi["POST /chat (FastAPI)"]
    clientApp --> resetApi["POST /reset (FastAPI)"]
    chatApi --> dbRead[fetch_active_bot_session]
    chatApi --> crmIn[upsert_inbound_user_message]
    dbRead --> graphEngine[LangGraph StateGraph]
    graphEngine --> intentChecker[intent_checker]
    intentChecker --> routerNode[router]
    routerNode --> domainNodes[car_selection | financing | promotions | lead_capture | faq]
    domainNodes --> crmOut[push_assistant_message_to_backend]
    graphEngine --> dbWrite[upsert_bot_session_state]
    dbWrite --> mysqlStore[(MySQL bot_sessions)]
    resetApi --> dbDelete[delete_bot_session]
    crmIn --> backend[(Backend API Node)]
    crmOut --> backend
    graphEngine --> chatApi
    chatApi --> clientApp
```

## Flujo de un turno

1. Cliente envia `user_id`, `message` y `platform`.
2. API consulta sesion activa en `bot_sessions`.
3. Registra el mensaje inbound en backend CRM (si hay token/configuracion).
4. Inserta mensaje de usuario en `state.messages` y ejecuta `graph.invoke(state)`.
5. Persiste mensajes `assistant` en backend CRM.
6. Guarda el `state_payload` actualizado (TTL 24h).
7. Responde con `reply`, `current_node` y `selected_car`.

## Principios de diseno

- Transiciones deterministas: la ruta del grafo depende de `state` y señales controladas.
- Interaccion conversacional pura: el bot responde en texto, sin botones de opcion en la UI.
- Aislamiento de responsabilidades:
  - `src/nodes`: logica conversacional por dominio (`car_selection`, `financing`, `promotions`, `lead_capture`, `faq`).
  - `src/nodes/intent_checker.py`: deteccion FAQ interruptiva para pausar/reanudar flujo.
  - `src/nodes/router.py`: clasificacion y enrutamiento principal.
  - `src/graph.py`: wiring de nodos y transiciones condicionales.
  - `src/tools/database.py`: persistencia MySQL e integraciones HTTP con backend.
  - `src/server.py`: endpoints `/chat`, `/reset`, `/health` y ciclo de turno.
