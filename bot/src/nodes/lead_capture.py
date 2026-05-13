"""Nodo para captura de datos del lead (pregunta a pregunta)."""

from __future__ import annotations

import json
import os
from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.services.llm_responses import (
    classify_lead_capture_navigation,
    classify_lead_capture_summary_confirmation,
    generate_lead_capture_intro,
    generate_verified_user_message,
)
from src.utils.lead_validators import (
    extract_email,
    extract_name,
    extract_phone_digits,
    is_valid_email,
    is_valid_full_name,
    is_valid_phone_digits,
    is_initial_only_name,
    normalize_stored_email,
    phone_min_digits,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

_PLATFORMS_PREFILL_PHONE = frozenset(
    s.strip().lower() for s in (os.getenv("LEAD_PLATFORMS_PHONE_IN_USER_ID", "web,whatsapp") or "web,whatsapp").split(",") if s.strip()
)


def _debug(event: str, **payload: Any) -> None:
    """Centraliza trazas de depuracion para este nodo."""
    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[lead_capture] {event} | {pairs}")
        return
    print(f"[lead_capture] {event}")


def _uses_prefill_phone(platform: str) -> bool:
    """Helper de apoyo para uses prefill phone."""
    p = (platform or "web").strip().lower()
    return p in _PLATFORMS_PREFILL_PHONE


def _last_assistant_content(state: clientState) -> str:
    """Helper de apoyo para last assistant content."""
    for m in reversed(state.get("messages", [])):
        if m.get("role") == "assistant":
            return str(m.get("content", ""))
    return ""


def _asked_for_name(state: clientState) -> bool:
    """Helper de apoyo para asked for name."""
    t = _last_assistant_content(state).lower()
    return "nombre" in t


def _asked_for_phone(state: clientState) -> bool:
    """Helper de apoyo para asked for phone."""
    t = _last_assistant_content(state).lower()
    return any(
        w in t
        for w in (
            "telefono",
            "teléfono",
            "número",
            "numero",
            "celular",
        )
    )


def _asked_for_email(state: clientState) -> bool:
    """Helper de apoyo para asked for email."""
    t = _last_assistant_content(state).lower()
    return "correo" in t or "email" in t or "electr" in t


def _clean_customer_info(info: dict[str, Any]) -> dict[str, str]:
    """Limpia customer info antes de persistirlos."""
    out: dict[str, str] = {}
    for k in ("nombre", "telefono", "email"):
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def _lead_capture_summary_facts(selected_car: str, preview: dict[str, str]) -> str:
    """Bloque literal para DATOS_VERIFICADOS del resumen pre-CRM."""
    return "\n".join(
        [
            f"vehiculo_etiqueta: {selected_car}",
            f"nombre: {preview.get('nombre', '')}",
            f"telefono: {preview.get('telefono', '')}",
            f"email: {preview.get('email', '')}",
        ]
    )


def _lead_capture_summary_fallback(selected_car: str, preview: dict[str, str]) -> str:
    """Texto fijo si falla el LLM en el paso de resumen."""
    return (
        f"Revisa tus datos para {selected_car}:\n\n"
        f"- Nombre: {preview.get('nombre', '')}\n"
        f"- Telefono: {preview.get('telefono', '')}\n"
        f"- Correo: {preview.get('email', '')}\n\n"
        "Si todo es correcto responde con un si claro. "
        "Si algo esta mal, indica que dato quieres corregir (nombre, telefono o correo)."
    )


def _append_lead_capture_summary(
    state: clientState,
    *,
    selected_car: str,
    preview: dict[str, str],
    latest_user: str,
    extra_facts: str = "",
) -> clientState:
    """Anexa el mensaje de resumen y confirmacion al historial."""
    facts = _lead_capture_summary_facts(selected_car, preview)
    if extra_facts.strip():
        facts = f"{facts}\n{extra_facts.strip()}"
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="lead_capture_summary_confirm",
            verified_facts_block=facts,
            user_message=latest_user,
            fallback=_lead_capture_summary_fallback(selected_car, preview),
            temperature=0.35,
        ),
    )


def _collect_missing_contact_fields(
    state: clientState,
    *,
    selected_car: str,
    platform: str,
    user_id: str,
    latest_user: str,
) -> clientState | None:
    """Pide y valida nombre, telefono y correo.

    Devuelve None si en este turno ya quedaron los tres campos y el llamador
    debe seguir (p. ej. mostrar resumen); si falta informacion, devuelve el
    estado con el mensaje al usuario.
    """
    info = dict(state.get("customer_info", {}))

    # 1) Nombre
    if not info.get("nombre"):
        if latest_user and _asked_for_name(state):
            extracted = extract_name(latest_user)
            _debug("name_extracted", raw=latest_user, extracted=extracted)
            if is_valid_full_name(extracted):
                info["nombre"] = extracted
                state["customer_info"] = info
                _debug("name_saved", nombre=info.get("nombre"))
            elif is_initial_only_name(extracted):
                _debug("name_rejected_initials", extracted=extracted)
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="lead_capture_step",
                        verified_facts_block=(
                            "campo: nombre_completo\n"
                            "resultado_validacion: solo_iniciales\n"
                            f"ultimo_intento_usuario_literal: {latest_user[:500]}\n"
                        ),
                        user_message=latest_user,
                        fallback="Necesitamos tu nombre completo, no solo iniciales. Indica nombre y apellido.",
                        temperature=0.35,
                    ),
                )
            else:
                _debug("name_rejected_invalid", extracted=extracted)
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="lead_capture_step",
                        verified_facts_block=(
                            "campo: nombre_completo\n"
                            "resultado_validacion: formato_invalido\n"
                            f"ultimo_intento_usuario_literal: {latest_user[:500]}\n"
                        ),
                        user_message=latest_user,
                        fallback="Por favor escribe tu nombre completo, nombre y apellido.",
                        temperature=0.35,
                    ),
                )
        if not info.get("nombre"):
            intro = generate_lead_capture_intro(selected_car, resuming=False)
            return append_assistant_message(state, intro)

    # 2) Telefono: precargar user_id en web/whatsapp si aplica; si no, pregunta y valida
    if not info.get("telefono"):
        if _uses_prefill_phone(platform) and is_valid_phone_digits(
            extract_phone_digits(user_id)
        ):
            info["telefono"] = extract_phone_digits(user_id)
            state["customer_info"] = info
            _debug("phone_prefilled", telefono=info.get("telefono"))
        else:
            if not info.get("telefono") and latest_user and _asked_for_phone(state):
                digits = extract_phone_digits(latest_user)
                _debug("phone_extracted", raw=latest_user, digits=digits)
                if is_valid_phone_digits(digits):
                    info["telefono"] = digits
                    state["customer_info"] = info
                    state["lead_phone_attempts"] = 0
                    _debug("phone_saved", telefono=info.get("telefono"))
                else:
                    n = int(state.get("lead_phone_attempts", 0) or 0) + 1
                    state["lead_phone_attempts"] = n
                    _debug("phone_rejected", attempts=n, digits=digits)
                    if n >= 2:
                        msg = generate_verified_user_message(
                            mode="lead_capture_step",
                            verified_facts_block=(
                                "campo: telefono\n"
                                f"resultado_validacion: digitos_insuficientes_intento_{n}\n"
                                f"min_digitos_requeridos: {phone_min_digits()}\n"
                            ),
                            user_message=latest_user,
                            fallback=(
                                f"Escribe solo el telefono en numeros, con al menos {phone_min_digits()} digitos "
                                "(por ejemplo, 5512345678 o tu numero a 10 digitos)."
                            ),
                            temperature=0.35,
                        )
                    else:
                        msg = generate_verified_user_message(
                            mode="lead_capture_step",
                            verified_facts_block=(
                                "campo: telefono\n"
                                "resultado_validacion: formato_invalido\n"
                                f"min_digitos_requeridos: {phone_min_digits()}\n"
                            ),
                            user_message=latest_user,
                            fallback=(
                                f"El telefono debe ser solo numeros y al menos {phone_min_digits()} digitos. "
                                "Cual es tu numero de telefono?"
                            ),
                            temperature=0.35,
                        )
                    return append_assistant_message(state, msg)
            if not info.get("telefono"):
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="lead_capture_step",
                        verified_facts_block="campo: telefono\nsituacion: solicitud_primera\n",
                        user_message=latest_user,
                        fallback="Cual es tu numero de telefono? (Solo numeros, sin letras.)",
                        temperature=0.35,
                    ),
                )

    # 3) Email
    if not info.get("email"):
        if latest_user:
            extracted_email = extract_email(latest_user) or normalize_stored_email(latest_user)
            _debug("email_extracted", raw=latest_user, extracted=extracted_email)
            if is_valid_email(extracted_email):
                info["email"] = normalize_stored_email(extracted_email)
                state["customer_info"] = info
                _debug("email_saved", email=info.get("email"))
            elif _asked_for_email(state):
                _debug("email_rejected", raw=latest_user)
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="lead_capture_step",
                        verified_facts_block=(
                            "campo: email\n"
                            "resultado_validacion: formato_invalido\n"
                            f"ultimo_intento_usuario_literal: {latest_user[:500]}\n"
                        ),
                        user_message=latest_user,
                        fallback="Ese no parece un correo valido. Escribe uno con formato nombre@dominio.com",
                        temperature=0.35,
                    ),
                )
        if not info.get("email"):
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="lead_capture_step",
                    verified_facts_block="campo: email\nsituacion: solicitud_primera\n",
                    user_message=latest_user,
                    fallback="Cual es tu correo electronico?",
                    temperature=0.35,
                ),
            )

    state["customer_info"] = dict(info)
    if info.get("nombre") and info.get("telefono") and info.get("email"):
        _debug("collect_missing_completed_same_turn")
        return None
    _debug(
        "lead_capture_incomplete_guard",
        has_name=bool(info.get("nombre")),
        has_phone=bool(info.get("telefono")),
        has_email=bool(info.get("email")),
    )
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="operational",
            verified_facts_block="situacion: lead_capture_datos_incompletos_guard\n",
            user_message=latest_user,
            fallback="Para registrar tu interes necesito tu nombre completo, telefono y correo electronico.",
            temperature=0.35,
        ),
    )


def _detect_navigation_override(user_text: str, previous_bot_message: str, selected_car: str) -> str:
    """Detecta cambio de flujo en lead_capture usando clasificacion LLM especializada."""
    if not str(user_text or "").strip():
        return ""
    classified = classify_lead_capture_navigation(
        previous_bot_message=previous_bot_message,
        user_message=user_text,
        selected_vehicle_name=selected_car,
    )
    if classified == "PROMOTIONS":
        return "promotions"
    if classified == "FINANCING":
        return "financing"
    if classified == "CAR_SELECTION":
        return "car_selection"
    return ""


def _intent_for_route_override(route_override: str) -> str:
    """Mapea el nodo destino al intent canónico de continuidad conversacional."""
    if route_override == "car_selection":
        return "vehicle_catalog"
    return route_override


def lead_capture(state: clientState) -> clientState:
    """Solicita nombre, telefono (condicional) y email; luego notifica y persiste al CRM."""

    state["current_node"] = "lead_capture"
    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppress_commercial_node_once", action="skip_node_execution")
        return state
    selected_car = (state.get("selected_car") or "").strip()
    platform = str(state.get("platform", "web") or "web").strip().lower() or "web"
    user_id = str(state.get("user_id", "")).strip()
    latest_user = latest_user_message(state)
    cinfo = state.get("customer_info", {}) or {}
    _debug(
        "entry",
        selected_car=selected_car,
        platform=platform,
        has_name=bool(cinfo.get("nombre")),
        has_phone=bool(cinfo.get("telefono")),
        has_email=bool(cinfo.get("email")),
        latest_user=latest_user,
    )
    if state.get("lead_capture_done") and all(
        cinfo.get(f) for f in ("nombre", "telefono", "email")
    ):
        # Si el lead ya se completo en un turno previo, volver al router para
        # evitar quedar atrapados en lead_capture en mensajes subsecuentes.
        state["current_node"] = "router"
        state["intent"] = ""
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block="evento: lead_capture_ya_completado_en_estado\ncustomer_info_completo: true\n",
                user_message=latest_user,
                fallback="Tus datos ya quedaron registrados. Un asesor se pondra en contacto contigo en breve.",
                temperature=0.35,
            ),
        )

    if state.get("skip_lead_prompt"):
        state["skip_lead_prompt"] = False
        if not selected_car:
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block="situacion: lead_capture_sin_vehiculo_seleccionado\n",
                    user_message=latest_user,
                    fallback="Primero debes elegir un vehiculo para continuar.",
                    temperature=0.35,
                ),
            )
        intro = generate_lead_capture_intro(selected_car, resuming=True)
        return append_assistant_message(state, intro)

    if not selected_car:
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block="situacion: lead_capture_sin_vehiculo_seleccionado\n",
                user_message=latest_user,
                fallback="Primero debes elegir un vehiculo para continuar.",
                temperature=0.35,
            ),
        )

    route_override = _detect_navigation_override(
        latest_user,
        _last_assistant_content(state),
        selected_car,
    )
    if route_override:
        state["awaiting_lead_capture_final_confirmation"] = False
        state["current_node"] = route_override
        state["intent"] = _intent_for_route_override(route_override)
        _debug("route_change", next_node=route_override, reason="user_navigation_override")
        return state

    while True:
        info = dict(state.get("customer_info", {}))
        if not (info.get("nombre") and info.get("telefono") and info.get("email")):
            collected = _collect_missing_contact_fields(
                state,
                selected_car=selected_car,
                platform=platform,
                user_id=user_id,
                latest_user=latest_user,
            )
            if collected is not None:
                return collected
            continue

        state["customer_info"] = dict(info)
        preview = _clean_customer_info(info)
        if not state.get("awaiting_lead_capture_final_confirmation"):
            state["awaiting_lead_capture_final_confirmation"] = True
            _debug("summary_shown", customer_info=preview)
            return _append_lead_capture_summary(
                state,
                selected_car=selected_car,
                preview=preview,
                latest_user=latest_user,
            )

        prev_assistant = _last_assistant_content(state)
        action = classify_lead_capture_summary_confirmation(
            previous_bot_message=prev_assistant,
            user_message=latest_user,
        )
        _debug("summary_action", action=action)
        if action == "CONFIRM":
            state["awaiting_lead_capture_final_confirmation"] = False
            break
        if action == "EDIT_NOMBRE":
            info.pop("nombre", None)
            state["customer_info"] = dict(info)
            state["awaiting_lead_capture_final_confirmation"] = False
            extracted = extract_name(latest_user)
            if is_valid_full_name(extracted) and not is_initial_only_name(extracted):
                info["nombre"] = extracted
                state["customer_info"] = dict(info)
                if info.get("nombre") and info.get("telefono") and info.get("email"):
                    state["awaiting_lead_capture_final_confirmation"] = True
                    return _append_lead_capture_summary(
                        state,
                        selected_car=selected_car,
                        preview=_clean_customer_info(info),
                        latest_user=latest_user,
                    )
                continue
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="lead_capture_step",
                    verified_facts_block="campo: nombre_completo\nsituacion: correccion_tras_resumen\n",
                    user_message=latest_user,
                    fallback="Perfecto. Escribe de nuevo tu nombre completo (nombre y apellido).",
                    temperature=0.35,
                ),
            )
        if action == "EDIT_TELEFONO":
            info.pop("telefono", None)
            state["customer_info"] = dict(info)
            state["awaiting_lead_capture_final_confirmation"] = False
            state["lead_phone_attempts"] = 0
            digits = extract_phone_digits(latest_user)
            if is_valid_phone_digits(digits):
                info["telefono"] = digits
                state["customer_info"] = dict(info)
                if info.get("nombre") and info.get("telefono") and info.get("email"):
                    state["awaiting_lead_capture_final_confirmation"] = True
                    return _append_lead_capture_summary(
                        state,
                        selected_car=selected_car,
                        preview=_clean_customer_info(info),
                        latest_user=latest_user,
                    )
                continue
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="lead_capture_step",
                    verified_facts_block=(
                        "campo: telefono\n"
                        "situacion: correccion_tras_resumen\n"
                        f"min_digitos_requeridos: {phone_min_digits()}\n"
                    ),
                    user_message=latest_user,
                    fallback=(
                        "Listo. Cual es tu numero de telefono correcto? "
                        f"(Solo numeros, al menos {phone_min_digits()} digitos.)"
                    ),
                    temperature=0.35,
                ),
            )
        if action == "EDIT_EMAIL":
            info.pop("email", None)
            state["customer_info"] = dict(info)
            state["awaiting_lead_capture_final_confirmation"] = False
            extracted_email = extract_email(latest_user) or normalize_stored_email(latest_user)
            if is_valid_email(extracted_email):
                info["email"] = normalize_stored_email(extracted_email)
                state["customer_info"] = dict(info)
                if info.get("nombre") and info.get("telefono") and info.get("email"):
                    state["awaiting_lead_capture_final_confirmation"] = True
                    return _append_lead_capture_summary(
                        state,
                        selected_car=selected_car,
                        preview=_clean_customer_info(info),
                        latest_user=latest_user,
                    )
                continue
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="lead_capture_step",
                    verified_facts_block="campo: email\nsituacion: correccion_tras_resumen\n",
                    user_message=latest_user,
                    fallback="Perfecto. Escribe de nuevo tu correo electronico.",
                    temperature=0.35,
                ),
            )
        return _append_lead_capture_summary(
            state,
            selected_car=selected_car,
            preview=preview,
            latest_user=latest_user,
            extra_facts="situacion: mensaje_ambiguo_repite_instrucciones_confirmacion_o_correccion\n",
        )

    # Solo CONFIRM sale del bucle (el resto de acciones hace return arriba).
    payload_info = _clean_customer_info(state.get("customer_info", {}))
    # Misma clave de conversación que en el resto de eventos: id de sesión del chat (no el telefono).
    # Así el backend hace find del mismo lead que acumulo la conversación, y `notes` incluye email.
    uid = str(user_id or "").strip() or "lead"
    financing_selection = {
        "plan_id": str(state.get("selected_financing_plan_id", "")).strip(),
        "plan_name": str(state.get("selected_financing_plan_name", "")).strip(),
        "lender": str(state.get("selected_financing_plan_lender", "")).strip(),
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    if not any(financing_selection.values()):
        financing_selection = {}
    promotion_selection = {
        "promotion_id": str(state.get("selected_promotion_id", "")).strip(),
        "title": str(state.get("selected_promotion_title", "")).strip(),
        "description": str(state.get("selected_promotion_description", "")).strip(),
        "valid_until": str(state.get("selected_promotion_valid_until", "")).strip(),
        "vehicle_ids": state.get("selected_promotion_vehicle_ids", []),
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    has_promotion = bool(
        promotion_selection["promotion_id"] or promotion_selection["title"] or promotion_selection["description"]
    )
    if not has_promotion:
        promotion_selection = {}
    owner_user_id = str(state.get("owner_user_id", "")).strip()

    _debug(
        "notify_payload_ready",
        selected_car=selected_car,
        owner_user_id=owner_user_id,
        customer_info=payload_info,
        financing_selection=financing_selection,
        promotion_selection=promotion_selection,
    )
    push_event_to_backend(
        {
            "user_id": uid,
            "platform": platform,
            "message": "lead_capture_completed",
            "selected_car": selected_car,
            "customer_info": payload_info,
            "financing_selection": financing_selection,
            "promotion_selection": promotion_selection,
        }
    )

    notify_success = False
    if owner_user_id:
        try:
            notify_advisor(
                selected_car,
                payload_info,
                owner_user_id=owner_user_id,
                financing_selection=financing_selection,
                promotion_selection=promotion_selection,
            )
            notify_success = True
        except Exception:
            _debug("notify_failed")
    else:
        _debug("notify_skipped_missing_owner_user_id")

    if notify_success or not owner_user_id:
        base_text = (
            f"Listo. Recibi tus datos para {selected_car} y ya notifique a un asesor para que se ponga en contacto contigo 😊🛞.\n"
            "Cualquier duda que tengas, puedo ayudarte con lo que necesites mientras se comunica tu asesor."
        )
        _debug("notify_success")
    else:
        base_text = (
            f"Recibi tus datos para {selected_car}. "
            "Hubo un problema temporal al notificar, pero un asesor te contactara."
        )

    state["lead_capture_done"] = True
    # Cerramos el turno actual y retomamos en router en el siguiente mensaje.
    state["current_node"] = "router"
    state["intent"] = ""

    verified_close = "\n".join(
        [
            f"vehiculo_etiqueta: {selected_car}",
            f"notify_advisor_exito: {str(notify_success).lower()}",
            f"owner_user_id_configurado: {str(bool(owner_user_id)).lower()}",
            f"customer_info_resumen: {json.dumps(payload_info, ensure_ascii=False)}",
        ]
    )
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="lead_capture_close",
            verified_facts_block=verified_close,
            user_message=latest_user,
            fallback=base_text,
            temperature=0.42,
        ),
    )
