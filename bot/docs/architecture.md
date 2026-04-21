# Arquitectura del MVP: Car Advisor Bot

## Objetivo

Este MVP implementa un bot conversacional asesor de carros con flujo guiado por estados
deterministas para que el frontend pueda renderizar botones de forma predecible.

## Stack

- FastAPI + uvicorn para exponer la API.
- LangGraph (StateGraph) para orquestar nodos de conversacion.
- Langchain OpenAI (ChatOpenAI) solo para formato de salida.
- MySQL (`mysql-connector-python`) para persistencia de sesion.
- Pydantic para validacion de entrada/salida.
- `python-dotenv` para configuracion por entorno.

## Componentes principales

```mermaid
flowchart TD
    clientApp[Frontend o canal] --> chatApi["POST /chat (FastAPI)"]
    chatApi --> dbRead[fetch_active_bot_session]
    dbRead --> graphEngine[LangGraph StateGraph]
    graphEngine --> nodesFlow[nodos deterministas]
    nodesFlow --> notifyAdvisor[/notificarAsesor]
    graphEngine --> dbWrite[upsert_bot_session_state]
    dbWrite --> mysqlStore[(MySQL bot_sessions)]
    graphEngine --> chatApi
    chatApi --> clientApp
```

## Flujo de un turno

1. Cliente envia `user_id` y `message`.
2. API consulta sesion activa en `bot_sessions`.
3. Inserta el mensaje de usuario en `state.messages`.
4. Ejecuta `graph.invoke(state)`.
5. Persiste nuevo `state_payload` con expiracion de 24h.
6. Responde con `reply`, `options` y estado actual.

## Principios de diseno

- Transiciones deterministas: la ruta depende del estado y texto actual, no de decisiones del LLM.
- Salida estructurada: `options` siempre se retorna para facilitar UI basada en botones.
- Aislamiento de responsabilidades:
  - `src/nodes`: logica conversacional por nodo.
  - `src/graph`: routing y wiring del grafo.
  - `src/tools/database`: acceso MySQL y serializacion.
  - `src/server`: contrato HTTP y ciclo del turno.
