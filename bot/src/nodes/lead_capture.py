"""Nodo para captura de datos del lead (pregunta a pregunta)."""

from __future__ import annotations

import os
from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.services.llm_responses import safe_llm_format, generate_lead_capture_intro
from src.utils.lead_validators import (
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
            if is_valid_full_name(extracted):
                info["nombre"] = extracted
                state["customer_info"] = info
            elif is_initial_only_name(extracted):
                return append_assistant_message(
                    state,
                    "Necesitamos tu nombre completo, no solo iniciales. Indica nombre y apellido.",
                )
            else:
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
        else:
            if not info.get("telefono") and latest_user and _asked_for_phone(state):
                digits = extract_phone_digits(latest_user)
                if is_valid_phone_digits(digits):
                    info["telefono"] = digits
                    state["customer_info"] = info
                    state["lead_phone_attempts"] = 0
                else:
                    n = int(state.get("lead_phone_attempts", 0) or 0) + 1
                    state["lead_phone_attempts"] = n
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
            if is_valid_email(latest_user):
                info["email"] = normalize_stored_email(latest_user)
                state["customer_info"] = info
            else:
                return append_assistant_message(
                    state,
                    "Ese no parece un correo valido. Escribe uno con formato nombre@dominio.com",
                )
        if not info.get("email"):
            return append_assistant_message(
                state, "Cual es tu correo electronico?"
            )

    payload_info = _clean_customer_info(state.get("customer_info", {}))
    uid = payload_info.get("telefono") or user_id or "lead"

    try:
        notify_advisor(selected_car, payload_info)
        push_event_to_backend(
            {
                "user_id": uid,
                "platform": platform,
                "message": "lead_capture_completed",
                "selected_car": selected_car,
                "customer_info": payload_info,
            }
        )
        base_text = f"Listo. Recibi tus datos para {selected_car} y ya notifique a un asesor."
    except Exception:
        base_text = (
            f"Recibi tus datos para {selected_car}. "
            "Hubo un problema temporal al notificar, pero un asesor te contactara."
        )
    else:
        state["lead_capture_done"] = True

    return append_assistant_message(state, safe_llm_format(base_text))
