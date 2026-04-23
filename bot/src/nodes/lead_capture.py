"""Nodo para captura de datos del lead."""

from src.state import clientState

from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.services.llm_responses import safe_llm_format
from src.utils.state_helpers import append_assistant_message, latest_user_message, parse_customer_info


def lead_capture(state: clientState) -> clientState:
    """Solicita y confirma datos de contacto del lead."""

    state["current_node"] = "lead_capture"
    selected_car = state.get("selected_car", "")
    if state.get("skip_lead_prompt"):
        state["skip_lead_prompt"] = False
        if not selected_car:
            base_text = "Primero debes elegir un vehiculo para continuar."
            message = safe_llm_format(base_text)
            return append_assistant_message(state, message)
        base_text = (
            f"Continuamos con {selected_car}. "
            "Comparte tus datos en formato nombre:..., telefono:..., email:...."
        )
        message = safe_llm_format(base_text)
        return append_assistant_message(state, message)
    if not selected_car:
        base_text = "Primero debes elegir un vehiculo para continuar."
        message = safe_llm_format(base_text)
        return append_assistant_message(state, message)

    latest_user_text = latest_user_message(state)
    new_info = parse_customer_info(latest_user_text)
    current_info = dict(state.get("customer_info", {}))
    current_info.update(new_info)
    state["customer_info"] = current_info

    required_fields = ["nombre", "telefono", "email"]
    missing_fields = [field for field in required_fields if not current_info.get(field)]

    if missing_fields:
        hint = ", ".join(missing_fields)
        base_text = (
            f"Para apartar {selected_car}, comparte tus datos en formato "
            f"nombre:..., telefono:..., email:.... Faltan: {hint}."
        )
        message = safe_llm_format(base_text)
        return append_assistant_message(state, message)

    try:
        notify_advisor(selected_car, current_info)
        push_event_to_backend(
            {
                "user_id": current_info.get("telefono", current_info.get("email", "lead")),
                "platform": "api",
                "message": "lead_capture_completed",
                "selected_car": selected_car,
                "customer_info": current_info,
            }
        )
        base_text = f"Listo. Recibi tus datos para {selected_car} y ya notifique a un asesor."
    except Exception:
        base_text = (
            f"Recibi tus datos para {selected_car}. "
            "Hubo un problema temporal al notificar, pero un asesor te contactara."
        )

    message = safe_llm_format(base_text)
    return append_assistant_message(state, message)
