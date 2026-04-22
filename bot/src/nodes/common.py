"""Utilidades compartidas entre nodos del flujo conversacional."""

from __future__ import annotations

import json
import os
from typing import Any

import requests
from langchain_openai import ChatOpenAI

from src.state import clientState


def safe_llm_format(text: str, options: list[str]) -> str:
    """Usa ChatOpenAI para dar formato, con fallback seguro al texto base."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = (
            "Reescribe el siguiente mensaje en espanol claro y breve. "
            "No cambies el significado ni agregues informacion nueva. "
            "Si hay opciones, mantenlas al final como lista.\n\n"
            f"Mensaje base: {text}\n"
            f"Opciones: {options}"
        )
        return llm.invoke(prompt).content.strip()
    except Exception:
        return text


def latest_user_message(state: clientState) -> str:
    """Obtiene el ultimo mensaje de usuario del historial."""

    for message in reversed(state.get("messages", [])):
        if message.get("role") == "user":
            return str(message.get("content", "")).strip()
    return ""


def latest_human_ai_pair(state: clientState) -> tuple[str, str]:
    """Obtiene el ultimo par relevante (Human -> AI) del historial operativo."""

    last_user = ""
    last_ai = ""
    for message in reversed(state.get("messages", [])):
        role = message.get("role")
        if role == "assistant" and not last_ai:
            last_ai = str(message.get("content", "")).strip()
        elif role == "user" and not last_user:
            last_user = str(message.get("content", "")).strip()
        if last_user and last_ai:
            break
    return last_user, last_ai


def append_assistant_message(state: clientState, text: str, options: list[str]) -> clientState:
    """Agrega respuesta al historial y actualiza campos de salida API."""

    messages = list(state.get("messages", []))
    messages.append({"role": "assistant", "content": text, "options": options, "type": "AIMessage"})
    state["messages"] = messages
    state["last_bot_message"] = text
    state["options"] = options
    return state


def is_faq_intent(text: str) -> bool:
    """Detector determinista de intencion FAQ/interrupcion."""

    normalized = text.strip().lower()
    faq_terms = [
        "faq",
        "pregunta",
        "informacion",
        "info",
        "horario",
        "financiamiento",
        "garantia",
        "ubicacion",
    ]
    return any(term in normalized for term in faq_terms)


def _vehicles_api_base_url() -> str:
    """Retorna base URL del backend para consultar catalogo de vehiculos."""

    return os.getenv("VEHICLES_API_BASE_URL", "http://localhost:4000").rstrip("/")


def _vehicles_api_headers() -> dict[str, str]:
    """Retorna headers para endpoint protegido si existe token."""

    token = os.getenv("BACKEND_SERVICE_TOKEN", "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def fetch_vehicles_catalog() -> list[dict[str, Any]]:
    """Obtiene catalogo de vehiculos desde el backend Node."""

    url = f"{_vehicles_api_base_url()}/api/vehicles"
    response = requests.get(url, headers=_vehicles_api_headers(), timeout=5)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    return []


def available_brands() -> list[str]:
    """Retorna marcas disponibles unicas desde el catalogo real."""

    vehicles = fetch_vehicles_catalog()
    seen: set[str] = set()
    brands: list[str] = []
    for item in vehicles:
        brand = str(item.get("brand", "")).strip()
        if not brand:
            continue
        key = brand.lower()
        if key in seen:
            continue
        seen.add(key)
        brands.append(brand)
    return brands


def available_models_by_brand(brand: str) -> list[str]:
    """Retorna modelos disponibles para una marca especifica."""

    normalized_brand = brand.strip().lower()
    if not normalized_brand:
        return []
    vehicles = fetch_vehicles_catalog()
    seen: set[str] = set()
    models: list[str] = []
    for item in vehicles:
        item_brand = str(item.get("brand", "")).strip().lower()
        if item_brand != normalized_brand:
            continue
        model = str(item.get("model", "")).strip()
        if not model:
            continue
        key = model.lower()
        if key in seen:
            continue
        seen.add(key)
        models.append(model)
    return models


def parse_customer_info(raw_text: str) -> dict[str, Any]:
    """Parsea datos de cliente en formato 'nombre:..., telefono:..., email:...'."""

    info: dict[str, Any] = {}
    if not raw_text:
        return info

    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    for token in raw_text.split(","):
        if ":" not in token:
            continue
        key, value = token.split(":", 1)
        key_norm = key.strip().lower()
        value_norm = value.strip()
        if key_norm and value_norm:
            info[key_norm] = value_norm
    return info


def notify_advisor(selected_car: str, customer_info: dict[str, Any]) -> None:
    """Notifica al asesor comercial via endpoint externo configurable."""

    endpoint = os.getenv("NOTIFY_ADVISOR_URL", "http://localhost:8000/notificarAsesor")
    payload = {"selected_car": selected_car, "customer_info": customer_info}
    requests.post(endpoint, json=payload, timeout=5)
