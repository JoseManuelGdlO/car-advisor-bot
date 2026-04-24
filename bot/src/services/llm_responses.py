"""Servicios de generación y reformateo de respuestas con LLM."""

from __future__ import annotations

import os

from langchain_openai import ChatOpenAI

from src.tools.database import get_bot_settings
from src.utils.prompts import (
    build_available_models_intro_prompt,
    build_faq_interrupt_classifier_prompt,
    build_financing_plan_selection_classifier_prompt,
    build_other_response_prompt,
    build_purchase_confirmation_classifier_prompt,
    build_router_intent_classifier_prompt,
    build_rewrite_prompt,
    build_lead_capture_intro_prompt,
    build_vehicle_detail_intro_prompt,
    build_vehicle_purchase_question_prompt,
    build_faq_response_prompt,
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


def classify_router_intent(user_message: str, previous_intent: str = "") -> str:
    """Clasifica intencion general del router: VEHICLE_CATALOG, FAQ, FINANCING u OTHER."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_router_intent_classifier_prompt(user_message, previous_intent, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"VEHICLE_CATALOG", "FAQ", "FINANCING", "OTHER"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def classify_faq_interrupt_intent(current_node: str, last_bot_message: str, user_message: str) -> str:
    """Clasifica si el mensaje es FAQ interruptiva o respuesta al flujo."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_faq_interrupt_classifier_prompt(current_node, last_bot_message, user_message, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"FAQ", "FLOW_RESPONSE"}:
            return normalized
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


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
