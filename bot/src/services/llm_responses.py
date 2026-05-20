"""Servicios de generación y reformateo de respuestas con LLM."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from langchain_openai import ChatOpenAI

from src.tools.database import get_bot_settings
from src.utils.prompts import (
    build_answer_first_faq_prompt,
    build_answer_first_financing_prompt,
    build_answer_first_inventory_prompt,
    build_answer_first_promotion_prompt,
    build_faq_interrupt_flags_prompt,
    build_financing_plan_comparison_extract_prompt,
    build_financing_plan_selection_classifier_prompt,
    build_promotion_comparison_extract_prompt,
    build_promotion_selection_extract_prompt,
    build_promotion_selection_classifier_prompt,
    build_other_response_prompt,
    build_purchase_confirmation_classifier_prompt,
    build_selected_vehicle_qa_prompt,
    build_router_intent_classifier_prompt,
    build_vehicle_comparison_conversation_prompt,
    build_vehicle_detail_conversation_prompt,
    build_faq_response_prompt,
    build_vehicle_comparison_extract_prompt,
    build_vehicle_step_flags_prompt,
    build_promotions_step_flags_prompt,
    build_financing_step_flags_prompt,
    build_lead_capture_navigation_classifier_prompt,
    build_lead_capture_summary_confirmation_classifier_prompt,
    build_settings_block,
    build_verified_user_message_prompt,
)

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


def _financing_listing_to_conversation(listing_block: str, follow_up_hint: str) -> str:
    """Convierte un listado de planes a texto conversacional sin vinetas."""

    lines = [str(line or "").rstrip() for line in str(listing_block or "").splitlines()]
    if not lines:
        return str(follow_up_hint or "").strip()

    header = ""
    plans: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    collecting_requirements = False

    for raw in lines:
        cleaned = re.sub(r"\*+", "", raw).strip()
        if not cleaned:
            collecting_requirements = False
            continue
        if cleaned.lower().startswith("planes de financiamiento para "):
            header = cleaned
            continue
        if cleaned.lower().startswith("estos son los planes de financiamiento"):
            header = cleaned
            continue

        plan_match = re.match(r"^(\d+)\.\s+(.+)$", cleaned)
        if plan_match:
            current = {
                "name": plan_match.group(2).strip(),
                "rate": "",
                "term": "",
                "requirements": [],
            }
            plans.append(current)
            collecting_requirements = False

            # Soporta formato en una sola linea: "Plan - Tasa: x - Plazo maximo: y"
            segments = [segment.strip() for segment in current["name"].split(" - ") if segment.strip()]
            if segments:
                current["name"] = segments[0]
            for segment in segments[1:]:
                lower_seg = segment.lower()
                if lower_seg.startswith("tasa:"):
                    current["rate"] = segment.split(":", 1)[1].strip()
                elif lower_seg.startswith("plazo maximo:"):
                    current["term"] = segment.split(":", 1)[1].strip()
            continue

        if not current:
            continue

        if cleaned.lower().startswith("requisitos:"):
            collecting_requirements = True
            continue

        if cleaned.startswith("-"):
            value = cleaned[1:].strip()
            lower_value = value.lower()
            if lower_value.startswith("tasa:"):
                current["rate"] = value.split(":", 1)[1].strip()
                collecting_requirements = False
            elif lower_value.startswith("plazo maximo:"):
                current["term"] = value.split(":", 1)[1].strip()
                collecting_requirements = False
            elif collecting_requirements and value:
                reqs = current.get("requirements", [])
                if isinstance(reqs, list):
                    reqs.append(value)
            continue

        if collecting_requirements and cleaned:
            reqs = current.get("requirements", [])
            if isinstance(reqs, list):
                reqs.append(cleaned)

    if not plans:
        return str(follow_up_hint or "").strip()

    intro = "Claro, te cuento las opciones de financiamiento disponibles."
    if header.lower().startswith("planes de financiamiento para "):
        vehicle = header.split("para", 1)[1].strip(" :")
        if vehicle:
            intro = f"Claro, para {vehicle} tenemos estas opciones de financiamiento."

    plan_sentences: list[str] = []
    for plan in plans:
        name = str(plan.get("name", "")).strip() or "un plan disponible"
        rate = str(plan.get("rate", "")).strip()
        term = str(plan.get("term", "")).strip()
        reqs = [str(item).strip() for item in plan.get("requirements", []) if str(item).strip()]

        details: list[str] = []
        if rate:
            details.append(f"una tasa de {rate}")
        if term:
            details.append(f"un plazo maximo de {term}")
        if reqs:
            details.append(f"requisitos como {', '.join(reqs)}")

        if details:
            plan_sentences.append(f"{name} maneja {', '.join(details)}.")
        else:
            plan_sentences.append(f"{name} esta disponible en este momento.")

    close = str(follow_up_hint or "").strip()
    body = " ".join(plan_sentences).strip()
    if close:
        return f"{intro} {body} {close}".strip()
    return f"{intro} {body}".strip()


def _promotion_listing_to_conversation(listing_block: str, closing_hint: str) -> str:
    """Convierte un listado de promociones a texto conversacional sin vinetas."""

    lines = [str(line or "").rstrip() for line in str(listing_block or "").splitlines()]
    if not lines:
        return str(closing_hint or "").strip()

    promotions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    collecting_vehicles = False

    for raw in lines:
        cleaned = re.sub(r"\*+", "", raw).strip()
        if not cleaned:
            collecting_vehicles = False
            continue
        if cleaned.lower().startswith("estas son las promociones disponibles"):
            continue
        match = re.match(r"^(\d+)\.\s+(.+)$", cleaned)
        if match:
            current = {
                "title": match.group(2).strip(),
                "description": "",
                "valid_until": "",
                "vehicles": [],
            }
            promotions.append(current)
            collecting_vehicles = False
            continue
        if not current:
            continue
        if cleaned.startswith("-"):
            value = cleaned[1:].strip()
            lower_value = value.lower()
            if lower_value.startswith("vigencia:"):
                current["valid_until"] = value.split(":", 1)[1].strip()
                collecting_vehicles = False
            elif lower_value.startswith("vehiculos aplicables:"):
                collecting_vehicles = True
            elif not current.get("description"):
                current["description"] = value
            elif collecting_vehicles and value:
                vehicles = current.get("vehicles", [])
                if isinstance(vehicles, list):
                    vehicles.append(value)
            continue
        if collecting_vehicles and current:
            vehicles = current.get("vehicles", [])
            if isinstance(vehicles, list):
                vehicles.append(cleaned)

    if not promotions:
        return str(closing_hint or "").strip()

    parts: list[str] = ["Claro, te cuento las promociones disponibles."]
    for promo in promotions:
        title = str(promo.get("title", "")).strip() or "una promocion activa"
        description = str(promo.get("description", "")).strip()
        valid_until = str(promo.get("valid_until", "")).strip()
        vehicles = [str(item).strip() for item in promo.get("vehicles", []) if str(item).strip()]

        sentence = f"{title}"
        if description:
            sentence += f" ofrece {description}"
        if valid_until:
            sentence += f" y su vigencia es hasta {valid_until}"
        if vehicles:
            sentence += f". Aplica para vehiculos como {', '.join(vehicles)}"
        sentence += "."
        parts.append(sentence)

    close = str(closing_hint or "").strip()
    if close:
        parts.append(close)
    return " ".join(part for part in parts if part).strip()


def generate_financing_plans_user_message(
    *,
    user_text: str,
    listing_block: str,
    follow_up_hint: str,
    fallback_semantic: str,
) -> str:
    """Mensaje conversacional de planes (sin pegar listado literal en la salida)."""

    listing = str(listing_block or "").strip()
    if not listing:
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block="operacion: financiamiento\nresultado: sin listado de planes en contexto\n",
            user_message=user_text,
            fallback=fallback_semantic,
            temperature=0.35,
        )
    fallback_conversation = _financing_listing_to_conversation(listing, follow_up_hint)
    prose = generate_verified_user_message(
        mode="financing_prose_only",
        verified_facts_block=(
            f"ultimo_mensaje_usuario:\n{user_text}\n\n"
            "contexto_planes_verificados:\n"
            f"{listing}\n\n"
            f"cierre_sugerido_literal:\n{follow_up_hint}\n"
        ),
        user_message=user_text,
        fallback=fallback_conversation or fallback_semantic,
        temperature=0.38,
    )
    return prose


def generate_promotion_listing_user_message(
    *,
    user_text: str,
    listing_block: str,
    closing_hint: str,
    fallback_semantic: str,
) -> str:
    """Mensaje conversacional de promociones (sin pegar listado literal en la salida).

    Importante: el texto que ve el usuario debe alinearse con el clasificador de step de promociones.
    Si el usuario ya elige una promocion por nombre o numero y expresa intencion de aplicarla,
    redacta la respuesta de forma que podamos interpretar esto como apply_promotion=true en el
    siguiente turno (por ejemplo, frases claras de que quiere aplicar esa promocion).
    No tomes decisiones de negocio (no confirmes cambios en el sistema), solo genera prosa clara.
    """

    listing = str(listing_block or "").strip()
    if not listing:
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block="operacion: promociones\nresultado: sin listado en contexto\n",
            user_message=user_text,
            fallback=fallback_semantic,
            temperature=0.35,
        )
    fallback_conversation = _promotion_listing_to_conversation(listing, closing_hint)
    prose = generate_verified_user_message(
        mode="promotion_prose_only",
        verified_facts_block=(
            f"ultimo_mensaje_usuario:\n{user_text}\n\n"
            "contexto_promociones_verificadas:\n"
            f"{listing}\n\n"
            "instrucciones_clasificador_step:\n"
            "- Si el usuario se refiere a una promocion especifica por nombre o numero y dice que quiere usarla, "
            "considera que en el siguiente turno el clasificador deberia ver apply_promotion=true.\n"
            "- Usa frases como 'si quieres aplicar la promocion X, confirmame que la quieres aplicar asi', "
            "para que el usuario pueda expresar esa intencion de forma explicita.\n\n"
            f"cierre_sugerido_literal:\n{closing_hint}\n"
        ),
        user_message=user_text,
        fallback=fallback_conversation or fallback_semantic,
        temperature=0.38,
    )
    return prose


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
    """Genera respuesta para intent `other` anclada a configuracion del bot (DATOS_VERIFICADOS)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    fallback = (
        "Hola soy CarAdvisor, estoy aqui para ayudarte. "
        "Buscas algun carro en especifico o deseas ver las marcas y modelos disponibles? "
        "Estoy aqui para resolver cualquier duda que tengas."
    )
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0.5)
        verified = build_settings_block(settings) or "CONFIGURACION_NEGOCIO: (sin campos extra)"
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
    return (
        f"Con gusto te platico del {name}: {body}. "
        "Si quieres, seguimos con mas detalles o vemos otro modelo."
    )


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


def generate_lead_capture_intro(
    selected_car: str,
    resuming: bool = False,
    *,
    verified_facts_block: str | None = None,
) -> str:
    """Mensaje inicial para captura de lead, anclado a DATOS_VERIFICADOS del estado."""

    name = (selected_car or "").strip() or "este vehiculo"
    fallback = (
        f"Continuamos con {name}. Necesitamos unos datos para darte seguimiento y "
        f"continuar con la compra de {name}. Cual es tu nombre completo?"
        if resuming
        else (
            f"Para darte seguimiento con la compra de {name}, "
            f"te pediremos unos datos. Cual es tu nombre completo?"
        )
    )
    block = str(verified_facts_block or "").strip()
    if not block:
        block = (
            f"vehiculo_seleccionado: {name}\n"
            f"reanudacion_flujo: {str(resuming).lower()}\n"
        )
    return generate_verified_user_message(
        mode="lead_capture_intro",
        verified_facts_block=block,
        user_message="",
        fallback=fallback,
        temperature=0.45,
    )


def generate_vehicle_purchase_question(*, images_invite_mode: str = "none") -> str:
    """Genera pregunta de cierre (interes en prueba de manejo o visita en persona) anclada a reglas literales.

    images_invite_mode: "none" | "first" | "more"
    """

    mode = (images_invite_mode or "none").strip().lower()
    if mode not in {"none", "first", "more"}:
        mode = "none"
    common_rules = (
        "prohibido: fechas, horas, dias, lugar, disponibilidad de agenda, coordinar cita\n"
        "solo_pregunta_interes: si (respuesta esperada: si, no, o pedir fotos/imagenes si aplica)\n"
        "el_equipo_dara_seguimiento: si (el bot no agenda ni confirma horarios)\n"
    )
    if mode == "more":
        literal = (
            "instruccion_sistema: El usuario puede confirmar interes en prueba de manejo o ver el vehiculo en persona, "
            "o pedir ver mas imagenes del mismo.\n"
            + common_rules
            + "texto_base_literal: ¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo. 🚗✨\n"
            "permite_emojis: si (maximo 2)\n"
        )
        fallback = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo. 🚗✨"
        )
    elif mode == "first":
        literal = (
            "instruccion_sistema: El usuario puede confirmar interes en prueba de manejo o ver el vehiculo en persona, "
            "o pedir ver fotos/imagenes del vehiculo (primer envio).\n"
            + common_rules
            + "texto_base_literal: ¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver fotos o imágenes del vehículo. 🚗✨\n"
            "permite_emojis: si (maximo 2)\n"
        )
        fallback = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver fotos o imágenes del vehículo. 🚗✨"
        )
    else:
        literal = (
            "instruccion_sistema: El usuario puede confirmar interes en prueba de manejo o ver el vehiculo en persona "
            "(sin opcion de imagenes en este turno).\n"
            + common_rules
            + "texto_base_literal: ¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? 🚗✨\n"
            "permite_emojis: si (maximo 2)\n"
        )
        fallback = "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
    return generate_verified_user_message(
        mode="purchase_question",
        verified_facts_block=literal,
        user_message="",
        fallback=fallback,
        temperature=0.45,
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
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_financing_plan_selection_intent",
            exc,
            model_name=model_name,
            prompt_kind="financing_plan_selection_classifier",
            temperature=0.0,
        )
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
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_promotion_selection_intent",
            exc,
            model_name=model_name,
            prompt_kind="promotion_selection_classifier",
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


def classify_lead_capture_summary_confirmation(
    previous_bot_message: str,
    user_message: str,
) -> str:
    """Clasifica la respuesta del usuario al resumen final de datos del lead."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_lead_capture_summary_confirmation_classifier_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            bot_settings=settings,
        )
        content = llm.invoke(prompt).content
        normalized = str(content).strip().upper()
        if normalized in {"CONFIRM", "EDIT_NOMBRE", "EDIT_TELEFONO", "EDIT_EMAIL", "UNCLEAR"}:
            return normalized
        return "UNCLEAR"
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_lead_capture_summary_confirmation",
            exc,
            model_name=model_name,
            prompt_kind="lead_capture_summary_confirmation_classifier",
            temperature=0.0,
        )
        return "UNCLEAR"


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


def classify_financing_plan_comparison_payload(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_plan_lines: str,
) -> dict[str, Any]:
    """Extrae comparacion de dos planes de financiamiento."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "wants_compare": False,
        "index_left": None,
        "index_right": None,
        "name_left": "",
        "name_right": "",
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_financing_plan_comparison_extract_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            numbered_plan_lines=numbered_plan_lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        out = dict(default)
        out["wants_compare"] = _coerce_to_bool(parsed.get("wants_compare"))
        out["name_left"] = str(parsed.get("name_left") or "").strip()
        out["name_right"] = str(parsed.get("name_right") or "").strip()
        for key in ("index_left", "index_right"):
            raw = parsed.get(key)
            if isinstance(raw, (int, float)) and not isinstance(raw, bool) and int(raw) == raw:
                out[key] = int(raw)
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_financing_plan_comparison_payload",
            exc,
            model_name=model_name,
            prompt_kind="financing_plan_comparison_extract",
            temperature=0.0,
        )
        return default


def classify_promotion_comparison_payload(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_promotion_lines: str,
) -> dict[str, Any]:
    """Extrae comparacion de dos promociones."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "wants_compare": False,
        "index_left": None,
        "index_right": None,
        "title_left": "",
        "title_right": "",
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_promotion_comparison_extract_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            numbered_promotion_lines=numbered_promotion_lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        out = dict(default)
        out["wants_compare"] = _coerce_to_bool(parsed.get("wants_compare"))
        out["title_left"] = str(parsed.get("title_left") or "").strip()
        out["title_right"] = str(parsed.get("title_right") or "").strip()
        for key in ("index_left", "index_right"):
            raw = parsed.get(key)
            if isinstance(raw, (int, float)) and not isinstance(raw, bool) and int(raw) == raw:
                out[key] = int(raw)
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_promotion_comparison_payload",
            exc,
            model_name=model_name,
            prompt_kind="promotion_comparison_extract",
            temperature=0.0,
        )
        return default


def extract_promotion_selection_payload(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_promotion_lines: str,
) -> dict[str, Any]:
    """Extrae indice 1-based o fragmento de titulo para mapear el mensaje del usuario a una promocion."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    default: dict[str, Any] = {
        "promotion_index": None,
        "title_query": "",
        "no_match": True,
    }
    lines = str(numbered_promotion_lines or "").strip()
    if not lines:
        return default
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_promotion_selection_extract_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            numbered_promotion_lines=lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return default
        out = dict(default)
        out["no_match"] = _coerce_to_bool(parsed.get("no_match"))
        out["title_query"] = str(parsed.get("title_query") or "").strip()
        raw_idx = parsed.get("promotion_index")
        if isinstance(raw_idx, (int, float)) and not isinstance(raw_idx, bool) and int(raw_idx) == raw_idx:
            out["promotion_index"] = int(raw_idx)
        return out
    except Exception as exc:
        _log_llm_invoke_failure(
            "extract_promotion_selection_payload",
            exc,
            model_name=model_name,
            prompt_kind="promotion_selection_extract",
            temperature=0.0,
        )
        return default


def classify_promotions_step_flags(
    *,
    previous_bot_message: str,
    user_message: str,
    current_promotion_title: str = "",
    numbered_promotion_lines: str = "",
) -> dict[str, bool]:
    """Clasifica flags de navegacion dentro del nodo promotions."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out = {
        "ask_financing": False,
        "ask_other_vehicles": False,
        "ask_promotions": False,
        "wants_compare_two_promotions": False,
        "select_promotion": False,
        "apply_promotion": False,
        "ask_promotion_vehicle_info": False,
        "cancel_promotion_flow": False,
        "confirm_yes": False,
        "confirm_no": False,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_promotions_step_flags_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            current_promotion_title=current_promotion_title,
            numbered_promotion_lines=numbered_promotion_lines,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return out
        for key in out:
            out[key] = _coerce_to_bool(parsed.get(key))
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_promotions_step_flags",
            exc,
            model_name=model_name,
            prompt_kind="promotions_step_flags_classifier",
            temperature=0.0,
        )
        return out
    return out


def classify_financing_step_flags(
    *,
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str = "",
    has_selected_vehicle: bool = False,
    has_selected_promotion: bool = False,
    awaiting_plan_selection: bool = False,
) -> dict[str, bool]:
    """Clasifica flags de navegacion dentro del paso de seleccion de plan en financing."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    out = {
        "reject_financing_keep_purchase": False,
        "ask_explicit_plan": True,
        "wants_compare_two_plans": False,
    }
    try:
        settings = get_bot_settings()
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_financing_step_flags_prompt(
            previous_bot_message=previous_bot_message,
            user_message=user_message,
            selected_vehicle_name=selected_vehicle_name,
            has_selected_vehicle=has_selected_vehicle,
            has_selected_promotion=has_selected_promotion,
            awaiting_plan_selection=awaiting_plan_selection,
            bot_settings=settings,
        )
        parsed = _parse_json_object_from_llm(str(llm.invoke(prompt).content or ""))
        if not parsed:
            return out
        for key in out:
            out[key] = _coerce_to_bool(parsed.get(key))
    except Exception as exc:
        _log_llm_invoke_failure(
            "classify_financing_step_flags",
            exc,
            model_name=model_name,
            prompt_kind="financing_step_flags_classifier",
            temperature=0.0,
        )
        return out
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
    fallback_base = (
        "No encontre informacion suficiente para responder eso con precision. "
        "Si quieres, te ayudo a revisar modelos, planes o a coordinar seguimiento para resolverlo."
    )
    fallback = generate_verified_user_message(
        mode="faq_insufficient",
        verified_facts_block=(
            "situacion: sin fragmentos FAQ en base de datos para la pregunta del usuario\n"
            f"mensaje_base_literal_para_tono: {fallback_base}\n"
        ),
        user_message=normalized_question,
        fallback=fallback_base,
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


def generate_faq_user_turn(
    *,
    user_question: str,
    faq_candidates: list[str],
    transition_literal: str = "",
    close_literal: str = "",
    compact_faq_body: bool = False,
) -> str:
    """Un solo mensaje al usuario: respuesta FAQ anclada a BD + transicion/cierre literales del flujo."""

    normalized_question = str(user_question or "").strip()
    context = "\n\n".join(str(item).strip() for item in faq_candidates if str(item).strip())
    if not normalized_question or not context:
        return generate_faq_response(normalized_question, faq_candidates)
    trans = str(transition_literal or "").strip()
    close = str(close_literal or "").strip()
    fallback_base = (
        "No encontre informacion suficiente para responder eso con precision. "
        "Si quieres, te ayudo a revisar modelos, planes o a coordinar seguimiento para resolverlo."
    )
    grounded_fallback = generate_verified_user_message(
        mode="faq_insufficient",
        verified_facts_block=(
            "situacion: generate_grounded_answer_fallo_o_vacio\n"
            f"mensaje_base_literal_para_tono: {fallback_base}\n"
        ),
        user_message=normalized_question,
        fallback=fallback_base,
        temperature=0.35,
    )
    body = generate_grounded_answer(
        user_question=normalized_question,
        context_blocks=context,
        mode="faq",
        fallback=grounded_fallback,
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
            prompt = build_answer_first_faq_prompt(question, context, settings)
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
