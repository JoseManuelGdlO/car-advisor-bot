"""Nodo para captura de datos del lead (mensaje unico con seguimiento de faltantes)."""

from __future__ import annotations

import json
from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.utils.bot_control import deactivate_bot
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
    parse_contact_from_message,
    phone_min_digits,
)
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("lead_capture")

_CONTACT_FIELDS = ("nombre", "telefono", "email")


def _debug(event: str, **payload: Any) -> None:
    """Trazas de depuracion; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "lead_capture", event, **payload)


def _last_assistant_content(state: clientState) -> str:
    """Helper de apoyo para last assistant content."""
    for m in reversed(state.get("messages", [])):
        if m.get("role") == "assistant":
            return str(m.get("content", ""))
    return ""


def _clean_customer_info(info: dict[str, Any]) -> dict[str, str]:
    """Limpia customer info antes de persistirlos."""
    out: dict[str, str] = {}
    for k in _CONTACT_FIELDS:
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def _missing_contact_field_keys(info: dict[str, Any]) -> list[str]:
    """Campos de contacto que aun no estan guardados."""
    return [k for k in _CONTACT_FIELDS if not info.get(k)]


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


def _field_label_es(field: str) -> str:
    labels = {
        "nombre": "nombre completo",
        "telefono": f"telefono (al menos {phone_min_digits()} digitos, solo numeros)",
        "email": "correo electronico",
    }
    return labels.get(field, field)


def _missing_fields_fallback(missing: list[str], invalid: list[str]) -> str:
    """Texto fijo para datos faltantes o invalidos tras respuesta bulk."""
    parts: list[str] = []
    for field in _CONTACT_FIELDS:
        if field in invalid:
            parts.append(_field_label_es(field) + " (revisa el formato)")
        elif field in missing:
            parts.append(_field_label_es(field))
    if not parts:
        return (
            "Para registrar tu interes necesito tu nombre completo, telefono y correo electronico "
            "en un solo mensaje."
        )
    joined = ", ".join(parts[:-1]) + (" y " + parts[-1] if len(parts) > 1 else parts[0])
    return (
        f"Gracias. Aun necesito tu {joined}. "
        "Puedes enviarlos juntos en un solo mensaje."
    )


def _append_missing_fields_message(
    state: clientState,
    *,
    missing: list[str],
    invalid: list[str],
    latest_user: str,
) -> clientState:
    """Pide solo los campos que faltan o fueron invalidos."""
    facts = "\n".join(
        [
            f"campos_faltantes: {','.join(missing) or 'ninguno'}",
            f"campos_invalidos: {','.join(invalid) or 'ninguno'}",
            f"min_digitos_telefono: {phone_min_digits()}",
        ]
    )
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="lead_capture_missing",
            verified_facts_block=facts,
            user_message=latest_user,
            fallback=_missing_fields_fallback(missing, invalid),
            temperature=0.35,
        ),
    )


def _merge_parsed_contact(
    state: clientState,
    info: dict[str, Any],
    parsed: dict[str, str],
    *,
    latest_user: str,
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Fusiona datos parseados en customer_info; devuelve listas de faltantes e invalidos."""

    missing = _missing_contact_field_keys(info)
    invalid: list[str] = []

    name = parsed.get("nombre", "")
    if name and not info.get("nombre"):
        if is_valid_full_name(name):
            info["nombre"] = name
            _debug("name_saved", nombre=name)
        elif is_initial_only_name(name):
            invalid.append("nombre")
            _debug("name_rejected_initials", extracted=name)
        else:
            invalid.append("nombre")
            _debug("name_rejected_invalid", extracted=name)

    phone = parsed.get("telefono", "")
    if phone and not info.get("telefono"):
        if is_valid_phone_digits(phone):
            info["telefono"] = phone
            state["lead_phone_attempts"] = 0
            _debug("phone_saved", telefono=phone)
        else:
            invalid.append("telefono")
            n = int(state.get("lead_phone_attempts", 0) or 0) + 1
            state["lead_phone_attempts"] = n
            _debug("phone_rejected", attempts=n, digits=phone)

    email_raw = parsed.get("email", "")
    if email_raw and not info.get("email"):
        if is_valid_email(email_raw):
            info["email"] = normalize_stored_email(email_raw)
            _debug("email_saved", email=info.get("email"))
        else:
            invalid.append("email")
            _debug("email_rejected", raw=latest_user)

    # Si el usuario escribio algo pero no se detecto un campo aun vacio, marcarlo como faltante
    # solo cuando ya pasamos la intro bulk (no forzar invalid sin parseo).
    missing = _missing_contact_field_keys(info)
    return info, missing, invalid


def _collect_missing_contact_fields(
    state: clientState,
    *,
    selected_car: str,
    latest_user: str,
) -> clientState | None:
    """Pide y valida nombre, telefono y correo en mensaje unico (con seguimiento de faltantes).

    Devuelve None si en este turno ya quedaron los tres campos y el llamador
    debe seguir (p. ej. mostrar resumen); si falta informacion, devuelve el
    estado con el mensaje al usuario.
    """
    info = dict(state.get("customer_info", {}))
    awaiting_bulk = bool(state.get("lead_capture_awaiting_bulk"))
    has_partial = any(info.get(f) for f in _CONTACT_FIELDS)
    should_parse = bool(latest_user.strip()) and (awaiting_bulk or has_partial)

    if should_parse:
        parsed = parse_contact_from_message(latest_user)
        _debug("bulk_parsed", parsed=parsed, raw=latest_user)
        info, missing, invalid = _merge_parsed_contact(
            state, info, parsed, latest_user=latest_user
        )
        state["customer_info"] = info

        if info.get("nombre") and info.get("telefono") and info.get("email"):
            _debug("collect_missing_completed_same_turn")
            return None

        if missing or invalid:
            return _append_missing_fields_message(
                state,
                missing=missing,
                invalid=invalid,
                latest_user=latest_user,
            )

    if not (info.get("nombre") and info.get("telefono") and info.get("email")):
        if not awaiting_bulk and not has_partial:
            state["lead_capture_awaiting_bulk"] = True
            intro = generate_lead_capture_intro(selected_car, resuming=False)
            return append_assistant_message(state, intro)

        _debug(
            "lead_capture_incomplete_guard",
            has_name=bool(info.get("nombre")),
            has_phone=bool(info.get("telefono")),
            has_email=bool(info.get("email")),
        )
        missing = _missing_contact_field_keys(info)
        return _append_missing_fields_message(
            state,
            missing=missing,
            invalid=[],
            latest_user=latest_user,
        )

    state["customer_info"] = dict(info)
    return None


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
    """Solicita nombre, telefono y email; luego notifica y persiste al CRM."""

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
        awaiting_bulk=bool(state.get("lead_capture_awaiting_bulk")),
        latest_user=latest_user,
    )
    if state.get("lead_capture_done") and all(
        cinfo.get(f) for f in _CONTACT_FIELDS
    ):
        state["current_node"] = "router"
        state["intent"] = ""
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block="evento: lead_capture_ya_completado_en_estado\ncustomer_info_completo: true\n",
                user_message=latest_user,
                fallback="Tus datos ya quedaron registrados. En breve te contactamos.",
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
        state["lead_capture_awaiting_bulk"] = True
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
        state["lead_capture_awaiting_bulk"] = False
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
                latest_user=latest_user,
            )
            if collected is not None:
                return collected
            continue

        state["lead_capture_awaiting_bulk"] = False
        state["customer_info"] = dict(info)
        preview = _clean_customer_info(info)
        if not state.get("awaiting_lead_capture_final_confirmation"):
            state["awaiting_lead_capture_final_confirmation"] = True
            state["lead_capture_awaiting_bulk"] = False
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
            state["lead_capture_awaiting_bulk"] = False
            break
        if action == "EDIT_NOMBRE":
            info.pop("nombre", None)
            state["customer_info"] = dict(info)
            state["awaiting_lead_capture_final_confirmation"] = False
            state["lead_capture_awaiting_bulk"] = False
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
            state["lead_capture_awaiting_bulk"] = False
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
            state["lead_capture_awaiting_bulk"] = False
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

    payload_info = _clean_customer_info(state.get("customer_info", {}))
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
            f"Listo. Recibi tus datos para {selected_car}. En breve te contactamos otra vez."
        )
        _debug("notify_success")
    else:
        base_text = (
            f"Recibi tus datos para {selected_car}. "
            "Hubo un problema temporal al registrar la alerta; pero dame unos momentos para resolverlo y en breve te contactamos."
        )

    state["lead_capture_done"] = True
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
    state = append_assistant_message(
        state,
        generate_verified_user_message(
            mode="lead_capture_close",
            verified_facts_block=verified_close,
            user_message=latest_user,
            fallback=base_text,
            temperature=0.42,
        ),
    )
    return deactivate_bot(state, reason="lead_capture")
