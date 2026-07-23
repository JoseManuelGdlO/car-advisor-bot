"""Servicios de generación y reformateo de respuestas con LLM."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from langchain_openai import ChatOpenAI

from src.state import clientState
from src.tools.database import faq_entry_to_candidate, get_bot_settings, get_business_profile
from src.utils.prompts import (
    append_bot_message_templates_to_verified_block,
    append_business_profile_to_verified_block,
    build_answer_first_faq_prompt,
    build_answer_first_financing_prompt,
    build_answer_first_inventory_prompt,
    build_answer_first_promotion_prompt,
    build_faq_interrupt_flags_prompt,
    build_other_response_prompt,
    build_purchase_confirmation_classifier_prompt,
    build_purchase_preferences_classifier_prompt,
    build_contact_method_classifier_prompt,
    build_selected_vehicle_qa_prompt,
    build_router_intent_classifier_prompt,
    build_vehicle_comparison_conversation_prompt,
    build_vehicle_detail_conversation_prompt,
    build_vehicle_detail_pitch_copy_prompt,
    build_faq_response_prompt,
    build_faq_selection_prompt,
    build_vehicle_comparison_extract_prompt,
    build_vehicle_pending_selection_extract_prompt,
    build_vehicle_requirement_match_prompt,
    build_vehicle_step_flags_prompt,
    build_financing_detail_escalation_prompt,
    build_lead_capture_navigation_classifier_prompt,
    build_settings_block,
    build_verified_user_message_prompt,
)
from src.utils.purchase_flow_messages import (
    LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL,
    contact_preference_resume_message,
    purchase_preferences_resume_message,
)
from src.utils.signals import is_simple_greeting

from src.utils.app_logging import get_app_logger

logger = logging.getLogger(__name__)
_app = get_app_logger("llm")


def _llm_failure_bucket(exc: BaseException) -> str:
    """Clasificación estable para filtrar fallos de proveedor/red sin imports frágiles."""
    if isinstance(exc, TimeoutError):
        return "timeout"
    name = type(exc).__name__
    nl = name.lower()
    if "timeout" in nl:
        return "timeout"
    if isinstance(exc, OSError):
        return "os_io"
    mod = getattr(exc, "__module__", "") or ""
    if "openai" in mod:
        if "ratelimit" in nl:
            return "rate_limit"
        if "apiconnection" in nl or "connecterror" in nl:
            return "connection"
        if "authentication" in nl:
            return "auth"
        if "badrequest" in nl:
            return "bad_request"
        return "openai"
    if "httpx" in mod:
        if "timeout" in nl:
            return "timeout"
        if "connect" in nl:
            return "connection"
        return "httpx"
    return "other"


def _llm_failure_http_attrs(exc: BaseException) -> str:
    parts: list[str] = []
    status = getattr(exc, "status_code", None)
    if status is not None:
        parts.append(f"http_status={status}")
    code = getattr(exc, "code", None)
    if code is not None and code != status:
        parts.append(f"code={code}")
    return " ".join(parts)


def _log_llm_invoke_failure(
    operation: str,
    exc: BaseException,
    *,
    model_name: str = "",
    mode: str | None = None,
    prompt_kind: str | None = None,
    temperature: float | None = None,
) -> None:
    """Registra fallo de invocación LLM con contexto; el caller devuelve el fallback acordado."""
    bucket = _llm_failure_bucket(exc)
    bits = [
        f"op={operation}",
        f"bucket={bucket}",
    ]
    if model_name:
        bits.append(f"model={model_name}")
    if mode:
        bits.append(f"mode={mode}")
    if prompt_kind:
        bits.append(f"prompt_kind={prompt_kind}")
    if temperature is not None:
        bits.append(f"temperature={temperature}")
    http_extra = _llm_failure_http_attrs(exc)
    if http_extra:
        bits.append(http_extra)
    ctx = " ".join(bits)
    detail = str(exc).strip().replace("\n", " ")[:500]
    # Evita un traceback enorme en logs cuando solo falta configurar la clave (muy ruidoso en tests).
    missing_key = type(exc).__name__ == "OpenAIError" and "api_key" in detail.lower()
    logger.warning(
        "%s | exc_type=%s | %s",
        ctx,
        type(exc).__name__,
        detail,
        exc_info=False if missing_key else exc,
    )


def generate_verified_user_message(
    *,
    mode: str,
    verified_facts_block: str,
    user_message: str = "",
    fallback: str | None = None,
    temperature: float = 0.4,
) -> str:
    """Genera mensaje al usuario usando solo DATOS_VERIFICADOS (bloque literal desde BD/API/formatters)."""

    facts = str(verified_facts_block or "").strip()
    fb = (fallback or "").strip() or (
        "No pude generar una respuesta en este momento. Intenta de nuevo en unos segundos."
    )
    if not facts:
        return fb
    facts = append_business_profile_to_verified_block(facts, get_business_profile())
    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=temperature)
        prompt = build_verified_user_message_prompt(mode, facts, user_message, settings)
        content = llm.invoke(prompt).content
        out = str(content).strip()
        if not out:
            return fb
        # Si el modelo devuelve una negativa meta ("no puedo generar respuesta"),
        # regresamos al fallback contextual para no romper la conversacion.
        lower_out = out.lower()
        if (
            "no pude generar" in lower_out
            or "no puedo generar" in lower_out
            or "en este turno" in lower_out
        ):
            return fb
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_verified_user_message",
            exc,
            model_name=model_name,
            mode=mode,
            prompt_kind="verified_user_message",
            temperature=temperature,
        )
        return fb


def compose_verified_prose_and_appendix(*, prose: str, appendix: str) -> str:
    """Concatena prosa LLM (sin listado) + bloque literal del formatter."""

    p = str(prose or "").strip()
    a = str(appendix or "").strip()
    if p and a:
        return f"{p}\n\n{a}"
    return p or a


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


def _optional_setting_text(settings: dict[str, Any], key: str) -> str | None:
    """Lee un setting opcional del tenant sin fallback."""

    raw = settings.get(key)
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _faq_insufficient_facts_block(
    settings: dict[str, Any],
    *,
    situation: str,
    tone_base: str,
) -> str:
    """Bloque DATOS_VERIFICADOS para FAQ sin match, con plantillas opcionales."""

    base = f"situacion: {situation}\nmensaje_base_literal_para_tono: {tone_base}\n"
    return append_bot_message_templates_to_verified_block(base, settings)


def generate_other_response(
    user_message: str,
    *,
    customer_name: str = "",
    onboarding_greeting_done: bool = False,
) -> str:
    """Genera respuesta para intent `other` anclada a configuracion del bot (DATOS_VERIFICADOS)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    fallback = (
        "Hola soy CarAdvisor, estoy aqui para ayudarte. "
        "Buscas algun carro en especifico o deseas ver las marcas y modelos disponibles? "
        "Estoy aqui para resolver cualquier duda que tengas."
    )
    try:
        settings = get_bot_settings()
        welcome = _optional_setting_text(settings, "welcomeMessage")
        has_known_name = bool(str(customer_name or "").strip())
        if (
            welcome
            and is_simple_greeting(user_message)
            and not has_known_name
            and not onboarding_greeting_done
        ):
            return welcome
        if has_known_name and onboarding_greeting_done:
            name = str(customer_name).strip()
            return (
                f"Hola {name}, con gusto te ayudo. "
                "Cuentame que vehiculo o informacion te interesa y lo revisamos."
            )
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        verified = build_settings_block(settings) or "CONFIGURACION_NEGOCIO: (sin campos extra)"
        verified = append_business_profile_to_verified_block(verified, get_business_profile())
        prompt = build_other_response_prompt(user_message, settings, verified_settings_block=verified)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or fallback
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_other_response",
            exc,
            model_name=model_name,
            prompt_kind="other_response",
            temperature=0.5,
        )
        return fallback


def _grounded_facts_to_fallback_paragraph(vehicle_name: str, facts_block: str) -> str:
    """Convierte lineas etiquetadas del formateador en un unico parrafo, sin lista, para fallback sin LLM."""

    name = vehicle_name.strip() or "este vehiculo"
    pairs: list[str] = []
    for raw in facts_block.splitlines():
        line = str(raw or "").strip()
        if not line:
            continue
        m = re.match(r"^\*{1,2}([^*]+)\*{1,2}:\s*(.+)$", line)
        if m:
            label = m.group(1).strip()
            value = re.sub(r"\*+", "", m.group(2)).strip()
            if value:
                pairs.append(f"{label.lower()} {value}")
            continue
        if ":" in line:
            label, _, rest = line.partition(":")
            label, rest = label.strip(), rest.strip()
            if label and rest:
                pairs.append(f"{label.lower()} {rest}")
    if not pairs:
        return f"Te comparto lo que tenemos de {name}. {facts_block.strip()}"
    body = ". ".join(pairs)
    return f"Con gusto te platico del {name}: {body}."


def generate_vehicle_detail_conversation(vehicle_name: str, grounded_facts_block: str) -> str:
    """Genera texto conversacional tipo vendedor usando solo hechos del bloque de inventario (p. ej. format_vehicle_detail)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_name = vehicle_name.strip() or "este vehiculo"
    facts = str(grounded_facts_block or "").strip()
    if not facts:
        operational = (
            f"vehicle_name: {normalized_name}\n"
            "ficha_disponible: false\n"
            "motivo: sin bloque de inventario para este id\n"
        )
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block=operational,
            user_message="",
            fallback=f"No tengo ficha detallada para {normalized_name} en este momento.",
            temperature=0.35,
        )
    fallback = _grounded_facts_to_fallback_paragraph(normalized_name, facts)
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.45)
        prompt = build_vehicle_detail_conversation_prompt(normalized_name, facts, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_vehicle_detail_conversation",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_detail_conversation",
            temperature=0.45,
        )
        return fallback


def _parse_vehicle_detail_pitch_copy(text: str, *, need_tagline: bool) -> dict[str, str]:
    """Parsea TAGLINE:/CIERRE: (o JSON) desde la salida del LLM."""

    raw = str(text or "").strip()
    result = {"tagline": "", "closing": ""}
    if not raw:
        return result

    parsed = _parse_json_object_from_llm(raw)
    if isinstance(parsed, dict):
        tagline = str(parsed.get("tagline") or parsed.get("TAGLINE") or "").strip()
        closing = str(parsed.get("closing") or parsed.get("cierre") or parsed.get("CIERRE") or "").strip()
        if need_tagline:
            result["tagline"] = tagline
        result["closing"] = closing
        return result

    tagline = ""
    closing = ""
    for line in raw.splitlines():
        cleaned = line.strip().strip('"').strip("'")
        if not cleaned:
            continue
        lower = cleaned.lower()
        if lower.startswith("tagline:"):
            tagline = cleaned.split(":", 1)[1].strip()
        elif lower.startswith("cierre:"):
            closing = cleaned.split(":", 1)[1].strip()
    if need_tagline and not tagline and not closing and "\n" not in raw:
        # Fallback: una sola linea sin prefijo se trata como tagline.
        tagline = raw
    if need_tagline:
        result["tagline"] = tagline
    result["closing"] = closing
    return result


def generate_vehicle_detail_pitch_copy(
    vehicle_name: str,
    facts_block: str,
    *,
    has_tagline: bool,
) -> dict[str, str]:
    """Genera tagline (si falta) y cierre corto para el pitch de detalle."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_name = vehicle_name.strip() or "este vehiculo"
    facts = str(facts_block or "").strip()
    empty = {"tagline": "", "closing": ""}
    if not facts:
        return empty
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.4)
        prompt = build_vehicle_detail_pitch_copy_prompt(
            normalized_name,
            facts,
            settings,
            has_tagline=has_tagline,
        )
        content = llm.invoke(prompt).content
        return _parse_vehicle_detail_pitch_copy(str(content), need_tagline=not has_tagline)
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_vehicle_detail_pitch_copy",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_detail_pitch_copy",
            temperature=0.4,
        )
        return empty


def _split_two_vehicle_grounding_block(combined: str) -> tuple[str, str]:
    """Separa el bloque emitido por `format_two_vehicle_comparison_grounding` en dos fichas."""

    div = "\n\nVEHICULO_B ("
    if div not in combined:
        return combined.strip(), ""
    left, right = combined.split(div, 1)
    if left.startswith("VEHICULO_A ("):
        idx = left.find("):\n")
        if idx != -1:
            left = left[idx + 3 :].lstrip()
    idx2 = right.find("):\n")
    if idx2 != -1:
        right = right[idx2 + 3 :].lstrip()
    return left.strip(), right.strip()


def _two_vehicle_comparison_fallback(
    vehicle_name_a: str,
    vehicle_name_b: str,
    grounded_two_block: str,
) -> str:
    """Parrafos de respaldo sin LLM, alineado al detalle conversacional."""

    a = vehicle_name_a.strip() or "el primer vehiculo"
    b = vehicle_name_b.strip() or "el segundo vehiculo"
    facts_a, facts_b = _split_two_vehicle_grounding_block(str(grounded_two_block or ""))
    if not facts_a and not facts_b:
        return (
            f"No tengo las fichas completas para comparar {a} y {b} ahora mismo. "
            "Prueba de nuevo en un momento."
        )
    parts: list[str] = []
    if facts_a:
        pa = _grounded_facts_to_fallback_paragraph(a, facts_a)
        suffix = " Si quieres, seguimos con mas detalles o vemos otro modelo."
        if pa.endswith(suffix):
            pa = pa[: -len(suffix)].rstrip()
        parts.append(pa)
    if facts_b:
        pb = _grounded_facts_to_fallback_paragraph(b, facts_b)
        suffix = " Si quieres, seguimos con mas detalles o vemos otro modelo."
        if pb.endswith(suffix):
            pb = pb[: -len(suffix)].rstrip()
        parts.append(pb)
    body = "\n\n".join(parts) if parts else str(grounded_two_block or "").strip()
    return body


def generate_vehicle_comparison_conversation(
    vehicle_name_a: str,
    vehicle_name_b: str,
    grounded_two_vehicle_block: str,
    *,
    user_message: str = "",
) -> str:
    """Genera comparacion conversacional anclada a las dos fichas de inventario."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    name_a = vehicle_name_a.strip() or "este vehiculo"
    name_b = vehicle_name_b.strip() or "el otro vehiculo"
    facts = str(grounded_two_vehicle_block or "").strip()
    if not facts:
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "operacion: comparacion_dos_vehiculos\n"
                f"vehiculo_a: {name_a}\n"
                f"vehiculo_b: {name_b}\n"
                "fichas_disponibles: false\n"
            ),
            user_message=user_message,
            fallback=(
                f"No tengo las dos fichas para comparar {name_a} y {name_b} en este momento. "
                "Prueba de nuevo o dime otro par de modelos."
            ),
            temperature=0.35,
        )
    fallback = _two_vehicle_comparison_fallback(name_a, name_b, facts)
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.45)
        prompt = build_vehicle_comparison_conversation_prompt(
            name_a,
            name_b,
            facts,
            user_message,
            settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        if not normalized:
            return fallback
        return normalized
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_vehicle_comparison_conversation",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_comparison_conversation",
            temperature=0.45,
        )
        return fallback


def generate_vehicle_candidates_selection_message(options_text: str, user_message: str = "") -> str:
    """Genera mensaje para elegir entre multiples vehiculos candidatos (solo datos verificados en lista)."""

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
    block = f"LISTA_OPCIONES:\n{normalized_options}\n"
    return generate_verified_user_message(
        mode="inventory_candidates",
        verified_facts_block=block,
        user_message=user_message,
        fallback=fallback,
        temperature=0.45,
    )


DEFAULT_CALENDAR_SCHEDULING_URL = "https://calendar.app.google/tYniJNfcrd8qXvut8"


def get_calendar_scheduling_url() -> str:
    """URL de agenda del owner actual (fallback defensivo si el backend no responde)."""

    settings = get_bot_settings()
    url = str(settings.get("calendarSchedulingUrl", "")).strip()
    return url or DEFAULT_CALENDAR_SCHEDULING_URL


def _lead_capture_scheduling_fallback(selected_car: str, *, resuming: bool = False) -> str:
    """Texto fijo si falla el LLM al compartir el enlace de agenda."""

    name = (selected_car or "").strip() or "este vehiculo"
    url = get_calendar_scheduling_url()
    intro = (
        f"Continuamos con {name}. Para agendar tu prueba de manejo o ver {name} en persona:"
        if resuming
        else f"Perfecto. Para agendar tu prueba de manejo o ver {name} en persona:"
    )
    return (
        f"{intro}\n\n"
        f"1. Abre este enlace: {url}\n"
        "2. Elige la fecha y hora que te convenga.\n"
        "3. Completa tus datos en el formulario y confirma la cita.\n\n"
        "Al confirmar, recibiras un correo con los detalles de tu cita."
    )


def generate_lead_capture_scheduling_message(
    selected_car: str,
    resuming: bool = False,
    *,
    verified_facts_block: str | None = None,
) -> str:
    """Instrucciones de agenda con link de calendario, ancladas a DATOS_VERIFICADOS."""

    name = (selected_car or "").strip() or "este vehiculo"
    fallback = _lead_capture_scheduling_fallback(name, resuming=resuming)
    block = str(verified_facts_block or "").strip()
    if not block:
        block = (
            f"vehiculo_seleccionado: {name}\n"
            f"url_agenda_literal: {get_calendar_scheduling_url()}\n"
            "confirmacion_cita_correo: al confirmar la cita en el calendario recibiras un correo de confirmacion\n"
            f"reanudacion_flujo: {str(resuming).lower()}\n"
        )
    return generate_verified_user_message(
        mode="lead_capture_scheduling",
        verified_facts_block=block,
        user_message="",
        fallback=fallback,
        temperature=0.35,
    )


def generate_selected_vehicle_qa_response(
    vehicle_name: str,
    grounded_facts_block: str,
    user_message: str,
) -> str:
    """Responde una pregunta puntual sobre el vehiculo usando solo la ficha verificada (inventario)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    normalized_name = vehicle_name.strip() or "este vehiculo"
    facts = str(grounded_facts_block or "").strip()
    question = str(user_message or "").strip()
    if not facts:
        operational = (
            f"vehicle_name: {normalized_name}\n"
            "ficha_disponible: false\n"
            "motivo: sin bloque de inventario\n"
        )
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block=operational,
            user_message=question,
            fallback=f"No tengo la ficha de {normalized_name} para responder eso en este momento.",
            temperature=0.35,
        )
    fallback = _grounded_facts_to_fallback_paragraph(normalized_name, facts)
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.35)
        prompt = build_selected_vehicle_qa_prompt(normalized_name, facts, question, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or fallback
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_selected_vehicle_qa_response",
            exc,
            model_name=model_name,
            prompt_kind="selected_vehicle_qa",
            temperature=0.35,
        )
        return fallback


def classify_purchase_confirmation_intent(previous_bot_message: str, user_message: str) -> str:
    """Clasifica confirmacion de compra: SI, NO, VER_MODELO, VER_MAS_IMAGENES, PREGUNTA_MODELO o UNKNOWN."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_purchase_confirmation_classifier_prompt(previous_bot_message, user_message, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"SI", "NO", "VER_MODELO", "VER_MAS_IMAGENES", "PREGUNTA_MODELO", "UNKNOWN"}:
            return normalized
        return "UNKNOWN"
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_purchase_confirmation_intent",
            exc,
            model_name=model_name,
            prompt_kind="purchase_confirmation_classifier",
            temperature=0.0,
        )
        return "UNKNOWN"


def classify_purchase_preferences(previous_bot_message: str, user_message: str) -> dict[str, str]:
    """Clasifica preferencias post-seleccion: transmission y payment_type (determinista, T=0)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out = {"transmission": "UNKNOWN", "payment_type": "UNKNOWN"}
    valid_transmission = {"AUTOMATICO", "ESTANDAR", "UNKNOWN"}
    valid_payment = {"CONTADO", "FINANCIADO", "UNKNOWN"}
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_purchase_preferences_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return out
        transmission = str(parsed.get("transmission", "UNKNOWN")).strip().upper()
        payment_type = str(parsed.get("payment_type", "UNKNOWN")).strip().upper()
        out["transmission"] = transmission if transmission in valid_transmission else "UNKNOWN"
        out["payment_type"] = payment_type if payment_type in valid_payment else "UNKNOWN"
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_purchase_preferences",
            exc,
            model_name=model_name,
            prompt_kind="purchase_preferences_classifier",
            temperature=0.0,
        )
        return out


def classify_contact_method(previous_bot_message: str, user_message: str) -> str:
    """Clasifica preferencia de contacto: WHATSAPP | CALL | APPOINTMENT | UNKNOWN (T=0)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_contact_method_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content or "").strip().upper()
        for label in ("WHATSAPP", "CALL", "APPOINTMENT", "UNKNOWN"):
            if re.search(rf"\b{re.escape(label)}\b", normalized):
                return label
        return "UNKNOWN"
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_contact_method",
            exc,
            model_name=model_name,
            prompt_kind="contact_method_classifier",
            temperature=0.0,
        )
        return "UNKNOWN"


def classify_router_intent(user_message: str, previous_intent: str = "") -> str:
    """Clasifica intencion general del router: VEHICLE_CATALOG, FAQ, FINANCING, PROMOTIONS, HUMAN_ADVISOR u OTHER."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_router_intent_classifier_prompt(user_message, previous_intent, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"VEHICLE_CATALOG", "FAQ", "FINANCING", "PROMOTIONS", "HUMAN_ADVISOR", "OTHER"}:
            return normalized
        return "UNKNOWN"
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_router_intent",
            exc,
            model_name=model_name,
            prompt_kind="router_intent_classifier",
            temperature=0.0,
        )
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
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_lead_capture_navigation",
            exc,
            model_name=model_name,
            prompt_kind="lead_capture_navigation_classifier",
            temperature=0.0,
        )
        return "STAY"


def classify_vehicle_requirement_matches(
    user_text: str,
    vehicles: list[dict[str, Any]],
) -> dict[str, Any]:
    """Clasifica si el usuario pide un filtro por uso/capacidad y resuelve IDs del catálogo."""

    from src.tools.vehicles import build_vehicle_requirement_catalog_block

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "is_requirement_search": False,
        "matched_vehicles": [],
        "criterion_summary": "",
    }
    catalog = [item for item in vehicles if isinstance(item, dict)]
    if not catalog or not str(user_text or "").strip():
        return default

    by_id = {
        str(item.get("id", "")).strip(): item
        for item in catalog
        if str(item.get("id", "")).strip()
    }
    try:
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_vehicle_requirement_match_prompt(
            user_text,
            build_vehicle_requirement_catalog_block(catalog),
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        is_requirement = _coerce_to_bool(parsed.get("is_requirement_search"))
        criterion = str(parsed.get("criterion_summary") or "").strip()
        raw_ids = parsed.get("matched_vehicle_ids")
        matched: list[dict[str, Any]] = []
        if isinstance(raw_ids, list):
            seen: set[str] = set()
            for raw in raw_ids:
                vehicle_id = str(raw or "").strip()
                if not vehicle_id or vehicle_id in seen:
                    continue
                vehicle = by_id.get(vehicle_id)
                if vehicle is None:
                    continue
                seen.add(vehicle_id)
                matched.append(vehicle)
        return {
            "is_requirement_search": is_requirement,
            "matched_vehicles": matched if is_requirement else [],
            "criterion_summary": criterion if is_requirement else "",
        }
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_vehicle_requirement_matches",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_requirement_match",
            temperature=0.0,
        )
        return default


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
        "ask_images": False,
        "ask_more_images": False,
        "wants_compare_two_vehicles": False,
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
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_vehicle_step_flags",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_step_flags_classifier",
            temperature=0.0,
        )
        return out
    return out


def classify_vehicle_comparison_payload(
    *,
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str = "",
    numbered_candidate_lines: str = "",
) -> dict[str, Any]:
    """Clasifica y extrae consultas para comparar dos vehiculos (JSON unificado)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "wants_compare": False,
        "query_left": "",
        "query_right": "",
        "use_selected_as_left": False,
        "use_candidate_indices": False,
        "index_left": None,
        "index_right": None,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_vehicle_comparison_extract_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            selected_vehicle_name=selected_vehicle_name,
            numbered_candidate_lines=numbered_candidate_lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        out = dict(default)
        out["wants_compare"] = _coerce_to_bool(parsed.get("wants_compare"))
        out["query_left"] = str(parsed.get("query_left") or "").strip()
        out["query_right"] = str(parsed.get("query_right") or "").strip()
        out["use_selected_as_left"] = _coerce_to_bool(parsed.get("use_selected_as_left"))
        out["use_candidate_indices"] = _coerce_to_bool(parsed.get("use_candidate_indices"))
        il = parsed.get("index_left")
        ir = parsed.get("index_right")
        out["index_left"] = int(il) if isinstance(il, (int, float)) and not isinstance(il, bool) and int(il) == il else None
        out["index_right"] = int(ir) if isinstance(ir, (int, float)) and not isinstance(ir, bool) and int(ir) == ir else None
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_vehicle_comparison_payload",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_comparison_extract",
            temperature=0.0,
        )
        return default


def extract_vehicle_pending_selection_payload(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_candidate_lines: str,
) -> dict[str, Any]:
    """Extrae indice 1-based o fragmento de nombre para mapear el mensaje del usuario a un vehiculo pendiente."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "vehicle_index": None,
        "name_query": "",
        "no_match": True,
    }
    lines = str(numbered_candidate_lines or "").strip()
    if not lines:
        return default
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_vehicle_pending_selection_extract_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            numbered_candidate_lines=lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        out = dict(default)
        out["no_match"] = _coerce_to_bool(parsed.get("no_match"))
        out["name_query"] = str(parsed.get("name_query") or "").strip()
        raw_idx = parsed.get("vehicle_index")
        if isinstance(raw_idx, (int, float)) and not isinstance(raw_idx, bool) and int(raw_idx) == raw_idx:
            out["vehicle_index"] = int(raw_idx)
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "extract_vehicle_pending_selection_payload",
            exc,
            model_name=model_name,
            prompt_kind="vehicle_pending_selection_extract",
            temperature=0.0,
        )
        return default


def classify_financing_detail_escalation(
    *,
    current_node: str,
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str = "",
    selected_plan_name: str = "",
    numbered_plan_lines: str = "",
) -> bool:
    """True si la pregunta de credito/financiamiento requiere asesor humano."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_financing_detail_escalation_prompt(
            current_node=current_node,
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            selected_vehicle_name=selected_vehicle_name,
            selected_plan_name=selected_plan_name,
            numbered_plan_lines=numbered_plan_lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return False
        return _coerce_to_bool(parsed.get("requiere_asesor_financiamiento"))
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_financing_detail_escalation",
            exc,
            model_name=model_name,
            prompt_kind="financing_detail_escalation_classifier",
            temperature=0.0,
        )
        return False


def _format_faq_catalog_for_selection(faq_entries: list[dict[str, str]]) -> str:
    """Numeracion 1-based para que el clasificador devuelva indices estables."""

    blocks: list[str] = []
    for index, entry in enumerate(faq_entries, start=1):
        question = str(entry.get("question", "")).strip() or "(sin pregunta)"
        answer = str(entry.get("answer", "")).strip() or "(sin respuesta)"
        blocks.append(f"FAQ #{index}\nP: {question}\nR: {answer}")
    return "\n\n".join(blocks)


def _parse_faq_selection_indices(parsed: dict[str, Any], *, catalog_size: int) -> list[int]:
    """Valida indices 1-based devueltos por el clasificador."""

    if _coerce_to_bool(parsed.get("sin_match")):
        return []
    raw = parsed.get("indices")
    if raw is None:
        raw = parsed.get("indices_seleccionados")
    if not isinstance(raw, list):
        return []
    valid: list[int] = []
    seen: set[int] = set()
    for item in raw:
        try:
            idx = int(item)
        except (TypeError, ValueError):
            continue
        if idx < 1 or idx > catalog_size or idx in seen:
            continue
        seen.add(idx)
        valid.append(idx)
    return valid


def select_faq_candidates_with_llm(
    user_question: str,
    faq_entries: list[dict[str, str]],
    *,
    max_candidates: int = 12,
) -> list[str]:
    """Elige FAQs relevantes del catalogo completo usando clasificador LLM."""

    question = str(user_question or "").strip()
    entries = [entry for entry in faq_entries if isinstance(entry, dict)]
    if not question or not entries:
        return []

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    catalog = _format_faq_catalog_for_selection(entries)
    max_n = max(1, min(int(max_candidates), len(entries)))
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_faq_selection_prompt(
            question,
            catalog,
            max_candidates=max_n,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        parsed = _parse_json_object_from_llm(str(content or ""))
        if not parsed:
            _app.info(
                "[llm] select_faq_candidates_with_llm parse_failed question=%r catalog_size=%d",
                question,
                len(entries),
            )
            return []
        indices = _parse_faq_selection_indices(parsed, catalog_size=len(entries))[:max_n]
        selected = [faq_entry_to_candidate(entries[i - 1]) for i in indices]
        _app.info(
            "[llm] select_faq_candidates_with_llm question=%r indices=%s count=%d",
            question,
            indices,
            len(selected),
        )
        return selected
    except Exception as exc:
        _log_llm_invoke_failure(
            "select_faq_candidates_with_llm",
            exc,
            model_name=model_name,
            prompt_kind="faq_selection_classifier",
            temperature=0.0,
        )
        return []


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
        "quiere_asesor_humano": False,
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
        out["quiere_asesor_humano"] = _coerce_to_bool(parsed.get("quiere_asesor_humano"))
        out["tema_vehiculo_inventario"] = _coerce_to_bool(parsed.get("tema_vehiculo_inventario"))
        out["tema_financiamiento_credi"] = _coerce_to_bool(parsed.get("tema_financiamiento_credi"))
        out["es_respuesta_o_seguimiento_al_ultimo_bot"] = _coerce_to_bool(
            parsed.get("es_respuesta_o_seguimiento_al_ultimo_bot")
        )
        if out["quiere_asesor_humano"]:
            _app.info(
                "[human_advisor] classify_faq_interrupt_flags llm_quiere_asesor_humano node=%r "
                "tema_vehiculo_inventario=%s es_seguimiento_bot=%s",
                current_node,
                out.get("tema_vehiculo_inventario"),
                out.get("es_respuesta_o_seguimiento_al_ultimo_bot"),
            )
            _app.debug(
                "[human_advisor] classify_faq_interrupt_flags_detail user_preview=%r bot_preview=%r",
                (user_message or "")[:200],
                (last_bot_message or "")[:200],
            )
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_faq_interrupt_flags",
            exc,
            model_name=model_name,
            prompt_kind=f"faq_interrupt_flags_classifier|graph_node={current_node}",
            temperature=0.0,
        )
        return out
    return out


def generate_faq_response(user_question: str, faq_candidates: list[str]) -> str:
    """Responde FAQ usando solo contexto proveniente de base de datos."""

    normalized_question = str(user_question or "").strip()
    context = "\n\n".join(str(item).strip() for item in faq_candidates if str(item).strip())
    settings = get_bot_settings()
    faq_fallback = _optional_setting_text(settings, "faqFallbackMessage")
    fallback_base = (
        "No encontre informacion suficiente para responder eso con precision. "
        "Si quieres, te ayudo a revisar modelos, planes o a coordinar seguimiento para resolverlo."
    )
    if not context and faq_fallback:
        return faq_fallback
    fallback = generate_verified_user_message(
        mode="faq_insufficient",
        verified_facts_block=_faq_insufficient_facts_block(
            settings,
            situation="sin fragmentos FAQ en base de datos para la pregunta del usuario",
            tone_base=fallback_base,
        ),
        user_message=normalized_question,
        fallback=faq_fallback or fallback_base,
        temperature=0.35,
    )
    if not normalized_question:
        return fallback
    if not context:
        return fallback
    return generate_grounded_answer(
        user_question=normalized_question,
        context_blocks=context,
        mode="faq",
        fallback=fallback,
    )


_FAQ_RESUME_TRANSITION_FALLBACKS: dict[str, str] = {
    "car_selection": "Perfecto. Sigamos con la selección de vehículos ",
    "lead_capture": (
        "Genial. Seguimos con tus datos para apartar el vehículo"
    ),
    "financing": "Excelente. Volvamos al financiamiento, tienes alguna preferencia?",
    "promotions": (
        "Perfecto. Sigamos con las promociones vigentes, quieres el detalle de alguna?"
    ),
}

def _faq_resume_flow_snapshot(state: clientState) -> dict[str, str | bool | int]:
    """Extrae hechos del estado para reanudar sin repetir pasos ya resueltos."""

    selected_car = str(state.get("selected_car", "")).strip()
    pending = state.get("last_vehicle_candidates")
    pending_n = len(pending) if isinstance(pending, list) else 0
    contact_method = str(state.get("contact_method", "")).strip().lower()
    return {
        "selected_car": selected_car,
        "has_selected_car": bool(selected_car),
        "awaiting_purchase_preferences": bool(state.get("awaiting_purchase_preferences")),
        "selected_transmission": str(state.get("selected_transmission", "")).strip(),
        "selected_payment_type": str(state.get("selected_payment_type", "")).strip(),
        "awaiting_purchase_confirmation": bool(state.get("awaiting_purchase_confirmation")),
        "contact_method": contact_method,
        "pending_vehicle_candidates": pending_n,
        "financing_plan_name": str(state.get("selected_financing_plan_name", "")).strip(),
        "has_financing_plan": bool(str(state.get("selected_financing_plan_name", "")).strip()),
        "awaiting_financing_plan_selection": bool(state.get("awaiting_financing_plan_selection")),
        "awaiting_financing_vehicle_selection": bool(state.get("awaiting_financing_vehicle_selection")),
        "promotion_title": str(state.get("selected_promotion_title", "")).strip(),
        "has_promotion": bool(str(state.get("selected_promotion_title", "")).strip()),
        "awaiting_promotion_selection": bool(state.get("awaiting_promotion_selection")),
        "awaiting_promotion_vehicle_selection": bool(state.get("awaiting_promotion_vehicle_selection")),
        "awaiting_promotion_vehicle_interest_confirmation": bool(
            state.get("awaiting_promotion_vehicle_interest_confirmation")
        ),
        "awaiting_promotion_apply_confirmation": bool(state.get("awaiting_promotion_apply_confirmation")),
    }


def _faq_resume_fixed_literal(snapshot: dict[str, str | bool | int]) -> str | None:
    """Literales fijos para pasos awaiting_purchase_*; None si debe usarse LLM/fallback."""

    if snapshot.get("awaiting_purchase_preferences"):
        return purchase_preferences_resume_message()
    if snapshot.get("awaiting_purchase_confirmation"):
        return contact_preference_resume_message(snapshot)
    return None


def _faq_resume_step_context(step: str, snapshot: dict[str, str | bool | int]) -> str:
    car = str(snapshot.get("selected_car", "")).strip()
    contact_method = str(snapshot.get("contact_method", "")).strip().lower()
    if step == "car_selection":
        if snapshot.get("awaiting_purchase_preferences"):
            suffix = f" del vehiculo ya elegido ({car})" if car else ""
            return f"captura de preferencias de transmision y pago{suffix}"
        if car and snapshot.get("awaiting_purchase_confirmation"):
            return f"preferencia de contacto (whatsapp, llamada o cita) para el vehiculo ya elegido ({car})"
        if car:
            return f"seguimiento del vehiculo ya elegido ({car}); no reiniciar busqueda en catalogo"
        if int(snapshot.get("pending_vehicle_candidates", 0)) > 0:
            return "desambiguacion entre candidatos de vehiculo ya listados"
        return "busqueda o seleccion inicial en catalogo"
    if step == "lead_capture":
        if contact_method in {"whatsapp", "call"}:
            car_bit = f" para el vehiculo ({car})" if car else ""
            return f"seguimiento de contacto por {contact_method}{car_bit}; no hablar de agenda"
        if car:
            return f"agenda de prueba de manejo o visita para el vehiculo ({car})"
        return "agenda de prueba de manejo o visita"
    if step == "financing":
        plan = str(snapshot.get("financing_plan_name", "")).strip()
        if plan:
            return f"continuacion con plan de financiamiento ya elegido ({plan})"
        if snapshot.get("awaiting_financing_vehicle_selection"):
            return "seleccion de vehiculo dentro de un plan de financiamiento"
        if snapshot.get("awaiting_financing_plan_selection"):
            return "seleccion de plan de financiamiento"
        if car:
            return f"opciones de financiamiento para el vehiculo ({car})"
        return "consulta de planes o preferencias de financiamiento"
    if step == "promotions":
        promo = str(snapshot.get("promotion_title", "")).strip()
        if promo:
            return f"continuacion con promocion ya elegida ({promo})"
        if snapshot.get("awaiting_promotion_apply_confirmation"):
            return "confirmacion para aplicar una promocion mostrada"
        if snapshot.get("awaiting_promotion_vehicle_interest_confirmation"):
            return "confirmacion de interes en vehiculo bajo promocion"
        if snapshot.get("awaiting_promotion_vehicle_selection"):
            return "seleccion de vehiculo aplicable a una promocion"
        if snapshot.get("awaiting_promotion_selection"):
            return "seleccion de promocion vigente"
        if car:
            return f"promociones aplicables al vehiculo ({car})"
        return "promociones vigentes y vehiculos aplicables"
    return "continuacion del proceso de compra o asesoria"


def _faq_resume_flow_facts_block(snapshot: dict[str, str | bool | int]) -> str:
    car = str(snapshot.get("selected_car", "")).strip() or "(ninguno)"
    plan = str(snapshot.get("financing_plan_name", "")).strip() or "(ninguno)"
    promo = str(snapshot.get("promotion_title", "")).strip() or "(ninguno)"
    transmission = str(snapshot.get("selected_transmission", "")).strip() or "(ninguno)"
    payment = str(snapshot.get("selected_payment_type", "")).strip() or "(ninguno)"
    contact_method = str(snapshot.get("contact_method", "")).strip() or "(ninguno)"
    return "\n".join(
        [
            f"vehiculo_seleccionado: {car}",
            f"esperando_preferencias_compra: {str(bool(snapshot.get('awaiting_purchase_preferences'))).lower()}",
            f"transmision_seleccionada: {transmission}",
            f"tipo_pago_seleccionado: {payment}",
            f"esperando_preferencia_contacto: {str(bool(snapshot.get('awaiting_purchase_confirmation'))).lower()}",
            f"esperando_confirmacion_compra: {str(bool(snapshot.get('awaiting_purchase_confirmation'))).lower()}",
            f"metodo_contacto: {contact_method}",
            f"candidatos_vehiculo_pendientes: {int(snapshot.get('pending_vehicle_candidates', 0))}",
            f"plan_financiamiento_seleccionado: {plan}",
            f"esperando_seleccion_plan: {str(bool(snapshot.get('awaiting_financing_plan_selection'))).lower()}",
            f"esperando_seleccion_vehiculo_en_plan: {str(bool(snapshot.get('awaiting_financing_vehicle_selection'))).lower()}",
            f"promocion_seleccionada: {promo}",
            f"esperando_seleccion_promocion: {str(bool(snapshot.get('awaiting_promotion_selection'))).lower()}",
            f"esperando_seleccion_vehiculo_promocion: {str(bool(snapshot.get('awaiting_promotion_vehicle_selection'))).lower()}",
            f"esperando_confirmacion_interes_promocion: {str(bool(snapshot.get('awaiting_promotion_vehicle_interest_confirmation'))).lower()}",
            f"esperando_confirmacion_aplicar_promocion: {str(bool(snapshot.get('awaiting_promotion_apply_confirmation'))).lower()}",
        ]
    )


def _faq_resume_transition_fallback(
    resume_to_step: str,
    snapshot: dict[str, str | bool | int],
) -> str:
    fixed = _faq_resume_fixed_literal(snapshot)
    if fixed:
        return fixed

    step = str(resume_to_step or "").strip()
    car = str(snapshot.get("selected_car", "")).strip()
    plan = str(snapshot.get("financing_plan_name", "")).strip()
    promo = str(snapshot.get("promotion_title", "")).strip()
    contact_method = str(snapshot.get("contact_method", "")).strip().lower()

    if step == "car_selection":
        if car:
            return f"¿Te gustaría seguir con {car} o ver más detalles del mismo?"
        if int(snapshot.get("pending_vehicle_candidates", 0)) > 0:
            return "¿Cuál de las opciones que te mostré te interesa más?"
        return _FAQ_RESUME_TRANSITION_FALLBACKS["car_selection"]

    if step == "lead_capture":
        if contact_method in {"whatsapp", "call"}:
            return LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL
        if car:
            return f"¿Seguimos con el enlace para agendar tu prueba de manejo o visita con el {car}?"
        return _FAQ_RESUME_TRANSITION_FALLBACKS["lead_capture"]

    if step == "financing":
        if plan:
            return f"¿Seguimos con el plan {plan}?"
        if snapshot.get("awaiting_financing_vehicle_selection"):
            return "¿Cuál vehículo del plan te gustaría revisar?"
        if snapshot.get("awaiting_financing_plan_selection"):
            return "¿Cuál plan de financiamiento te gustaría revisar?"
        if car:
            return f"¿Quieres ver opciones de financiamiento para el {car}?"
        return _FAQ_RESUME_TRANSITION_FALLBACKS["financing"]

    if step == "promotions":
        if promo:
            return f"¿Seguimos con la promoción {promo}?"
        if snapshot.get("awaiting_promotion_apply_confirmation"):
            return "¿Confirmas que quieres aplicar esa promoción?"
        if snapshot.get("awaiting_promotion_vehicle_interest_confirmation"):
            return "¿Te interesa ese vehículo con la promoción?"
        if snapshot.get("awaiting_promotion_vehicle_selection"):
            return "¿Cuál vehículo de la promoción te gustaría revisar?"
        if snapshot.get("awaiting_promotion_selection"):
            return "¿Cuál promoción vigente te gustaría revisar?"
        if car:
            return f"¿Quieres ver promociones aplicables al {car}?"
        return _FAQ_RESUME_TRANSITION_FALLBACKS["promotions"]

    return "Perfecto. Continuemos con tu proceso. ¿En qué te apoyo ahora?"


def generate_faq_resume_transition(
    *,
    user_message: str,
    last_bot_message: str,
    resume_to_step: str,
    state: clientState | None = None,
) -> str:
    """Genera pregunta de reanudacion tras FAQ interruptiva, anclada al ultimo mensaje del bot."""

    step = str(resume_to_step or "car_selection").strip() or "car_selection"
    snapshot = _faq_resume_flow_snapshot(state or {})
    fixed = _faq_resume_fixed_literal(snapshot)
    if fixed:
        return fixed

    fallback = _faq_resume_transition_fallback(step, snapshot)
    last_bot = str(last_bot_message or "").strip()
    if not last_bot:
        return fallback

    user_faq = str(user_message or "").strip()
    step_context = _faq_resume_step_context(step, snapshot)
    flow_facts = _faq_resume_flow_facts_block(snapshot)
    verified = "\n".join(
        [
            f"paso_a_reanudar: {step}",
            f"contexto_del_paso: {step_context}",
            "estado_flujo:",
            flow_facts,
            f"ultimo_mensaje_bot: {last_bot[:500]}",
            f"mensaje_usuario_faq: {user_faq[:500] or '(sin mensaje)'}",
        ]
    )
    return generate_verified_user_message(
        mode="faq_resume_transition",
        verified_facts_block=verified,
        user_message=user_faq,
        fallback=fallback,
        temperature=0.4,
    )


def generate_faq_user_turn(
    *,
    user_question: str,
    faq_candidates: list[str],
    transition_literal: str = "",
    close_literal: str = "",
    faq_close_topic: str = "general",
    compact_faq_body: bool = False,
) -> str:
    """Un solo mensaje al usuario: respuesta FAQ anclada a BD + transicion/cierre literales del flujo."""

    normalized_question = str(user_question or "").strip()
    context = "\n\n".join(str(item).strip() for item in faq_candidates if str(item).strip())
    if not normalized_question or not context:
        return generate_faq_response(normalized_question, faq_candidates)
    trans = str(transition_literal or "").strip()
    close = str(close_literal or "").strip()
    close_topic = str(faq_close_topic or "general").strip().lower() or "general"
    fallback_base = (
        "No encontre informacion suficiente para responder eso con precision. "
        "Si quieres, te ayudo a revisar modelos, planes o a coordinar seguimiento para resolverlo."
    )
    settings = get_bot_settings()
    faq_fallback = _optional_setting_text(settings, "faqFallbackMessage")
    grounded_fallback = generate_verified_user_message(
        mode="faq_insufficient",
        verified_facts_block=_faq_insufficient_facts_block(
            settings,
            situation="generate_grounded_answer_fallo_o_vacio",
            tone_base=fallback_base,
        ),
        user_message=normalized_question,
        fallback=faq_fallback or fallback_base,
        temperature=0.35,
    )
    body = generate_grounded_answer(
        user_question=normalized_question,
        context_blocks=context,
        mode="faq",
        fallback=grounded_fallback,
        faq_close_topic=close_topic,
    )
    fb_parts = [body]
    if trans:
        fb_parts.append(trans)
    if close:
        fb_parts.append(close)
    fallback = "\n\n".join(p for p in fb_parts if p)
    verified = "\n".join(
        [
            "BASE_FAQ_DESDE_BD:",
            context,
            "",
            f"faq_respuesta_compacta: {str(bool(compact_faq_body)).lower()}",
            f"tema_faq_cierre: {close_topic}",
            f"transicion_literal: {trans or '(ninguna)'}",
            f"cierre_literal: {close or '(ninguno)'}",
        ]
    )
    return generate_verified_user_message(
        mode="faq_turn",
        verified_facts_block=verified,
        user_message=normalized_question,
        fallback=fallback,
        temperature=0.38,
    )


def generate_grounded_answer(
    *,
    user_question: str,
    context_blocks: str,
    mode: str,
    fallback: str,
    faq_close_topic: str = "general",
) -> str:
    """Genera respuesta semántica verídica con patrón answer-first por dominio."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    question = str(user_question or "").strip()
    context = str(context_blocks or "").strip()
    safe_fallback = str(fallback or "").strip() or "No tengo suficiente informacion para responder con precision."
    if not question:
        return safe_fallback
    if not context:
        return safe_fallback
    mode_key = str(mode or "").strip().lower()
    if mode_key == "faq":
        context = append_business_profile_to_verified_block(context, get_business_profile())
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.35)
        if mode_key == "inventory":
            prompt = build_answer_first_inventory_prompt(question, context, settings)
        elif mode_key == "financing":
            prompt = build_answer_first_financing_prompt(question, context, settings)
        elif mode_key == "promotion":
            prompt = build_answer_first_promotion_prompt(question, context, settings)
        elif mode_key == "faq":
            prompt = build_answer_first_faq_prompt(
                question,
                context,
                settings,
                faq_close_topic=faq_close_topic,
            )
        else:
            prompt = build_faq_response_prompt(question, context, settings)
        content = llm.invoke(prompt).content
        normalized = str(content).strip()
        return normalized or safe_fallback
    except Exception as exc:
        _log_llm_invoke_failure(
            "generate_grounded_answer",
            exc,
            model_name=model_name,
            mode=mode_key,
            prompt_kind=f"answer_first_{mode_key or 'default'}",
            temperature=0.35,
        )
        return safe_fallback
