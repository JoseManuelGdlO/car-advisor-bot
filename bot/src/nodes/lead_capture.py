"""Nodo para captura de datos del lead (pregunta a pregunta)."""

from __future__ import annotations

import os
from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.services.llm_responses import safe_llm_format, generate_lead_capture_intro
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
    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[lead_capture] {event} | {pairs}")
        return
    print(f"[lead_capture] {event}")


def _uses_prefill_phone(platform: str) -> bool:
    p = (platform or "web").strip().lower()
    return p in _PLATFORMS_PREFILL_PHONE


def _last_assistant_content(state: clientState) -> str:
    for m in reversed(state.get("messages", [])):
        if m.get("role") == "assistant":
            return str(m.get("content", ""))
    return ""


def _asked_for_name(state: clientState) -> bool:
    t = _last_assistant_content(state).lower()
    return "nombre" in t


def _asked_for_phone(state: clientState) -> bool:
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
    t = _last_assistant_content(state).lower()
    return "correo" in t or "email" in t or "electr" in t


def _clean_customer_info(info: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k in ("nombre", "telefono", "email"):
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def lead_capture(state: clientState) -> clientState:
    """Solicita nombre, telefono (condicional) y email; luego notifica y persiste al CRM."""

    state["current_node"] = "lead_capture"
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
        return append_assistant_message(
            state,
            safe_llm_format(
                "Tus datos ya quedaron registrados. Un asesor se pondra en contacto contigo en breve."
            ),
        )

    if state.get("skip_lead_prompt"):
        state["skip_lead_prompt"] = False
        if not selected_car:
            return append_assistant_message(
                state, safe_llm_format("Primero debes elegir un vehiculo para continuar.")
            )
        intro = generate_lead_capture_intro(selected_car, resuming=True)
        return append_assistant_message(state, intro)

    if not selected_car:
        return append_assistant_message(
            state, safe_llm_format("Primero debes elegir un vehiculo para continuar.")
        )

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
                    "Necesitamos tu nombre completo, no solo iniciales. Indica nombre y apellido.",
                )
            else:
                _debug("name_rejected_invalid", extracted=extracted)
                return append_assistant_message(
                    state, "Por favor escribe tu nombre completo, nombre y apellido."
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
                        msg = (
                            f"Escribe solo el telefono en numeros, con al menos {phone_min_digits()} digitos "
                            "(por ejemplo, 5512345678 o tu numero a 10 digitos)."
                        )
                    else:
                        msg = (
                            f"El telefono debe ser solo numeros y al menos {phone_min_digits()} digitos. "
                            "Cual es tu numero de telefono?"
                        )
                    return append_assistant_message(state, msg)
            if not info.get("telefono"):
                return append_assistant_message(
                    state,
                    "Cual es tu numero de telefono? (Solo numeros, sin letras.)",
                )

    # 3) Email
    if not info.get("email"):
        if latest_user and _asked_for_email(state):
            extracted_email = extract_email(latest_user) or normalize_stored_email(latest_user)
            _debug("email_extracted", raw=latest_user, extracted=extracted_email)
            if is_valid_email(extracted_email):
                info["email"] = normalize_stored_email(extracted_email)
                state["customer_info"] = info
                _debug("email_saved", email=info.get("email"))
            else:
                _debug("email_rejected", raw=latest_user)
                return append_assistant_message(
                    state,
                    "Ese no parece un correo valido. Escribe uno con formato nombre@dominio.com",
                )
        if not info.get("email"):
            return append_assistant_message(
                state, "Cual es tu correo electronico?"
            )

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

    try:
        _debug(
            "notify_payload_ready",
            selected_car=selected_car,
            customer_info=payload_info,
            financing_selection=financing_selection,
            promotion_selection=promotion_selection,
        )
        notify_advisor(
            selected_car,
            payload_info,
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
        base_text = f"Listo. Recibi tus datos para {selected_car} y ya notifique a un asesor para que se ponga en contacto contigo 😊🛞.\n"
        "Cualquier duda que tengas, puedo ayudarte con lo que necesites mientras se comunica tu asesor."
    except Exception:
        _debug("notify_failed")
        base_text = (
            f"Recibi tus datos para {selected_car}. "
            "Hubo un problema temporal al notificar, pero un asesor te contactara."
        )
    else:
        _debug("notify_success")
        state["lead_capture_done"] = True
        # Cerramos el turno actual y retomamos en router en el siguiente mensaje.
        state["current_node"] = "router"
        state["intent"] = ""

    return append_assistant_message(state, safe_llm_format(base_text))
