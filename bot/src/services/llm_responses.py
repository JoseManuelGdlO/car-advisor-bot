"""Servicios de generación y reformateo de respuestas con LLM."""

from __future__ import annotations

import os

from langchain_openai import ChatOpenAI

from src.tools.database import get_bot_settings
from src.utils.prompts import build_other_response_prompt, build_rewrite_prompt


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
