"""Helpers compartidos para fetch y formato de imágenes de vehículo."""

from __future__ import annotations

from typing import Any, Callable

from src.state import clientState
from src.tools.vehicles import fetch_vehicle_images
from src.utils.formatters import format_images_bulleted_list
from src.utils.signals import NO_IMAGES_AVAILABLE_MESSAGE
from src.services.llm_responses import generate_verified_user_message
from src.utils.whatsapp_markers import (
    build_whatsapp_image_marker_block,
    normalize_image_url_for_chat,
)


def reset_vehicle_images_state(state: clientState) -> None:
    """Reinicia cursores y lotes de imágenes del vehículo seleccionado."""

    state["vehicle_images_cursor"] = 0
    state["vehicle_images_has_more"] = False
    state["vehicle_images_last_batch"] = []


def fetch_top_images_for_vehicle(state: clientState, vehicle_id: str, *, limit: int = 2) -> list[str]:
    """Obtiene el primer lote de imágenes y actualiza estado de paginación."""

    try:
        payload = fetch_vehicle_images(vehicle_id, mode="top", limit=limit)
        images = payload.get("images", [])
        state["vehicle_images_last_batch"] = images if isinstance(images, list) else []
        state["vehicle_images_has_more"] = bool(payload.get("hasMore"))
        next_cursor = payload.get("nextCursor")
        if isinstance(next_cursor, int) and next_cursor >= 0:
            state["vehicle_images_cursor"] = next_cursor
        else:
            state["vehicle_images_cursor"] = len(state["vehicle_images_last_batch"])
        return state["vehicle_images_last_batch"]
    except Exception:
        reset_vehicle_images_state(state)
        return []


def format_images_block_for_chat(
    images: list[str],
    *,
    resolve_url_fn: Callable[[str], str] | None = None,
) -> str:
    """Renderiza bloque de imágenes en texto para canales no-WhatsApp."""

    resolver = resolve_url_fn or normalize_image_url_for_chat
    if not images:
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "tipo: bloque_imagenes_vacio\n"
                f"texto_literal_sistema: {NO_IMAGES_AVAILABLE_MESSAGE}\n"
            ),
            user_message="",
            fallback=NO_IMAGES_AVAILABLE_MESSAGE,
            temperature=0.35,
        )
    return format_images_bulleted_list(images, resolver)


def build_whatsapp_images_block(state: clientState, vehicle_id: str, images: list[str]) -> str:
    """Genera marcadores JSON para envío de imágenes por WhatsApp."""

    user_id = str(state.get("user_id", "")).strip()
    if not user_id or not vehicle_id or not images:
        return ""
    return build_whatsapp_image_marker_block(
        to=user_id,
        vehicle_id=vehicle_id,
        image_urls=images,
    )


def build_vehicle_images_message(
    state: clientState,
    vehicle_id: str,
    images: list[str],
    *,
    format_block_fn: Callable[[list[str]], str],
    whatsapp_block_fn: Callable[[clientState, str, list[str]], str],
) -> str:
    """Arma mensaje de imágenes según plataforma, con hint de paginación si aplica."""

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    if platform == "whatsapp":
        marker_block = whatsapp_block_fn(state, vehicle_id, images)
        message = marker_block or format_block_fn(images)
    else:
        message = format_block_fn(images)
    if state.get("vehicle_images_has_more"):
        message = f"{message}\n\nSi quieres ver mas imagenes, dímelo."
    elif images:
        message = f"{message}\n\nEstas son todas las imagenes disponibles de este vehiculo."
    return message
