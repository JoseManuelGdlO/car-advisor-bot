"""Servicios de generación y reformateo de respuestas con LLM."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from langchain_openai import ChatOpenAI

from src.tools.database import get_bot_settings
from src.utils.prompts import (
    build_available_models_intro_prompt,
    build_faq_interrupt_flags_prompt,
    build_financing_plan_selection_classifier_prompt,
    build_promotion_selection_classifier_prompt,
    build_other_response_prompt,
    build_purchase_confirmation_classifier_prompt,
    build_router_intent_classifier_prompt,
    build_rewrite_prompt,
    build_lead_capture_intro_prompt,
    build_vehicle_detail_intro_prompt,
    build_vehicle_candidates_selection_prompt,
    build_vehicle_purchase_question_prompt,
    build_faq_response_prompt,
    build_vehicle_step_flags_prompt,
    build_promotions_step_flags_prompt,
    build_lead_capture_navigation_classifier_prompt,
)


def safe_llm_format(text: str) -> str:
    """Usa ChatOpenAI para dar formato, con fallback seguro al texto base."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_rewrite_prompt(text, settings)
        return llm.invoke(prompt).content.strip()
    except Exception:
        return text


def _parse_json_object_from_llm(text: str) -> dict[str, Any] | None:
    """Extrae el primer JSON objeto de la salida del modelo (permite crudos o bloque ```json)."""

    raw = (text or "").strip()
    if not raw:
        return None
    m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw, re.IGNORECASE)
    if m:
        raw = m.group(1).strip()
    if not raw.lstrip().startswith("{"):
        o = re.search(r"\{[\s\S]*\}", raw)
        if o:
            raw = o.group(0)
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(obj, dict):
        return obj
    return None


def _coerce_to_bool(value: Any) -> bool:
    """Convierte valores comunes a booleano de forma tolerante."""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, str):
        t = value.strip().lower()
        if t in ("true", "1", "sí", "si", "verdadero", "s"):
            return True
        if t in ("false", "0", "no", "falso", "n"):
            return False
        return False
    if isinstance(value, (int, float)):
        if value == 1:
            return True
        if value == 0:
            return False
    return False


def generate_other_response(user_message: str) -> str:
    """Genera respuesta para intent `other` sin texto base predefinido."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    fallback = (
        "Hola soy CarAdvisor, estoy aqui para ayudarte. "
        "Buscas algun carro en especifico o deseas ver las marcas y modelos disponibles? "
        "Estoy aqui para resolver cualquier duda que tengas."
    )
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_other_response_prompt(user_message, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or fallback
    except Exception:
        return fallback


def generate_available_models_intro() -> str:
    """Genera introduccion embellecida para lista de modelos disponibles."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    fallback = "Aqui tienes los modelos disponibles. Te gustaria saber mas sobre alguno?"
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_available_models_intro_prompt(settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized.replace("\n", " ").strip()
    except Exception:
        return fallback


def generate_vehicle_detail_intro(vehicle_name: str) -> str:
    """Genera introduccion embellecida para detalle del vehiculo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_name = vehicle_name.strip() or "este vehiculo"
    fallback = f"Aqui tienes la informacion completa de {normalized_name}."
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_vehicle_detail_intro_prompt(normalized_name, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized.replace("\n", " ").strip()
    except Exception:
        return fallback


def generate_vehicle_candidates_selection_message(options_text: str) -> str:
    """Genera mensaje para elegir entre multiples vehiculos candidatos."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_options = str(options_text or "").strip()
    fallback = (
        "Encontre varios carros similares. ¿Cual te interesa?\n"
        f"{normalized_options}\n\n"
        "Puedes responder con el nombre o el numero."
        if normalized_options
        else "Encontre varios carros similares. ¿Cual te interesa? Puedes responder con el nombre o el numero."
    )
    if not normalized_options:
        return fallback
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_vehicle_candidates_selection_prompt(normalized_options, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or fallback
    except Exception:
        return fallback


def generate_lead_capture_intro(selected_car: str, resuming: bool = False) -> str:
    """Mensaje inicial para captura de lead: explicar contacto con asesor y pedir nombre completo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    name = (selected_car or "").strip() or "este vehiculo"
    fallback = (
        f"Continuamos con {name}. Necesitamos unos datos para que un asesor te contacte y "
        f"continuar con la compra de {name}. Cual es tu nombre completo?"
        if resuming
        else (
            f"Para que un asesor pueda comunicarse contigo y ayudarte con la compra de {name}, "
            f"te pediremos unos datos. Cual es tu nombre completo?"
        )
    )
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_lead_capture_intro_prompt(name, settings, resuming=resuming)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized.replace("\n", " ").strip()
    except Exception:
        return fallback


def generate_vehicle_purchase_question() -> str:
    """Genera pregunta embellecida para confirmar compra."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    fallback = "Te interesa comprar este vehiculo o quieres ver mas imagenes del mismo? 🚗🖼️ "
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        prompt = build_vehicle_purchase_question_prompt(settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized.replace("\n", " ").strip()
    except Exception:
        return fallback


def classify_purchase_confirmation_intent(previous_bot_message: str, user_message: str) -> str:
    """Clasifica confirmacion de compra: SI, NO, VER_MODELO o VER_MAS_IMAGENES."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_purchase_confirmation_classifier_prompt(previous_bot_message, user_message, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"SI", "NO", "VER_MODELO", "VER_MAS_IMAGENES"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def classify_financing_plan_selection_intent(
    previous_bot_message: str,
    user_message: str,
    plan_count: int,
    single_plan_name: str = "",
) -> str:
    """Clasifica si el usuario confirma plan unico, rechaza o sigue ambiguo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_financing_plan_selection_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            plan_count=plan_count,
            single_plan_name=single_plan_name,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"SELECT_SINGLE_PLAN", "ASK_EXPLICIT_PLAN", "REJECT"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def classify_promotion_selection_intent(
    previous_bot_message: str,
    user_message: str,
    promotion_count: int,
    single_promotion_title: str = "",
) -> str:
    """Clasifica si el usuario confirma aplicar una promocion unica."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_promotion_selection_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            promotion_count=promotion_count,
            single_promotion_title=single_promotion_title,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"APPLY_SINGLE_PROMOTION", "ASK_EXPLICIT_PROMOTION", "REJECT"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def classify_router_intent(user_message: str, previous_intent: str = "") -> str:
    """Clasifica intencion general del router: VEHICLE_CATALOG, FAQ, FINANCING u OTHER."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_router_intent_classifier_prompt(user_message, previous_intent, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"VEHICLE_CATALOG", "FAQ", "FINANCING", "PROMOTIONS", "OTHER"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def classify_lead_capture_navigation(
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str = "",
) -> str:
    """Clasifica si en lead_capture se debe continuar o desviar de flujo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_lead_capture_navigation_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            selected_vehicle_name=selected_vehicle_name,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"STAY", "PROMOTIONS", "FINANCING", "CAR_SELECTION"}:
            return normalized
        return "STAY"
    except Exception:
        return "STAY"


def classify_vehicle_step_flags(
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
) -> dict[str, bool]:
    """Clasifica flags de navegacion cuando estamos en confirmacion de compra de vehiculo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out = {
        "ask_promotions": False,
        "ask_financing": False,
        "ask_more_images": False,
        "wants_other_vehicles": False,
        "confirm_purchase": False,
        "reject_purchase": False,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_vehicle_step_flags_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            selected_vehicle_name=selected_vehicle_name,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return out
        for key in out:
            out[key] = _coerce_to_bool(parsed.get(key))
    except Exception:
        pass
    return out


def classify_promotions_step_flags(user_message: str, current_promotion_title: str = "") -> dict[str, bool]:
    """Clasifica flags de navegacion dentro del nodo promotions."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out = {
        "ask_financing": False,
        "ask_other_vehicles": False,
        "ask_promotions": False,
        "confirm_yes": False,
        "confirm_no": False,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_promotions_step_flags_prompt(
            user_message=user_message,
            current_promotion_title=current_promotion_title,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return out
        for key in out:
            out[key] = _coerce_to_bool(parsed.get(key))
    except Exception:
        pass
    return out


def classify_faq_interrupt_flags(
    current_node: str,
    last_bot_message: str,
    user_message: str,
    *,
    awaiting_purchase_confirmation: bool = False,
    pending_vehicle_count: int = 0,
) -> dict[str, bool]:
    """Clasificador con flags: decide si se interrumpe por FAQ de negocio frente a continuidad de flujo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out: dict[str, bool] = {
        "interrumpir_por_faq": False,
        "tema_vehiculo_inventario": False,
        "tema_financiamiento_credi": False,
        "es_respuesta_o_seguimiento_al_ultimo_bot": False,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_faq_interrupt_flags_prompt(
            current_node,
            last_bot_message,
            user_message,
            awaiting_purchase_confirmation,
            pending_vehicle_count,
            settings,
        )
        content = llm.invoke(prompt).content
        parsed = _parse_json_object_from_llm(str(content or ""))
        if not parsed:
            return out
        out["interrumpir_por_faq"] = _coerce_to_bool(parsed.get("interrumpir_por_faq"))
        out["tema_vehiculo_inventario"] = _coerce_to_bool(parsed.get("tema_vehiculo_inventario"))
        out["tema_financiamiento_credi"] = _coerce_to_bool(parsed.get("tema_financiamiento_credi"))
        out["es_respuesta_o_seguimiento_al_ultimo_bot"] = _coerce_to_bool(
            parsed.get("es_respuesta_o_seguimiento_al_ultimo_bot")
        )
    except Exception:
        pass
    return out


def generate_faq_response(user_question: str, faq_candidates: list[str]) -> str:
    """Responde FAQ usando solo contexto proveniente de base de datos."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_question = str(user_question or "").strip()
    context = "\n\n".join(str(item).strip() for item in faq_candidates if str(item).strip())
    fallback_base = (
        "Lo siento, pero no tengo informacion suficiente para responder esa pregunta. "
        "Si gustas, puedo orientarte con un asesor para resolver todas tus dudas."
    )
    fallback = safe_llm_format(fallback_base)
    if not normalized_question:
        return fallback
    if not context:
        return fallback
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_faq_response_prompt(normalized_question, context, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or fallback
    except Exception:
        return fallback
