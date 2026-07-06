"""Helpers compartidos para URLs de imagen y marcadores WhatsApp."""

from __future__ import annotations

import json

from src.tools.vehicles import _normalize_public_image_url, build_whatsapp_image_messages
from src.utils.signals import WC_DOCUMENT_MARKER_PREFIX, WC_IMAGE_MARKER_PREFIX


def normalize_image_url_for_chat(raw_url: str) -> str:
    """Normaliza URL relativa/absoluta con base pública accesible desde WhatsApp Connect."""

    return _normalize_public_image_url(raw_url)


def build_whatsapp_image_marker_block(
    *,
    to: str,
    vehicle_id: str,
    image_urls: list[str] | None = None,
    limit: int = 3,
    mode: str = "top",
    cursor: int | None = None,
) -> str:
    """Construye bloque de marcadores JSON para imágenes de WhatsApp."""

    image_messages = build_whatsapp_image_messages(
        to=to,
        vehicle_id=vehicle_id,
        image_urls=image_urls,
        limit=limit,
        mode=mode,
        cursor=cursor,
    )
    marker_lines: list[str] = []
    for message in image_messages:
        image_url = str(message.get("imageUrl", "")).strip()
        if not image_url:
            continue
        marker_lines.append(f"{WC_IMAGE_MARKER_PREFIX}{json.dumps(message, ensure_ascii=True)}")
    return "\n".join(marker_lines)


def build_whatsapp_document_marker_block(
    *,
    to: str,
    document_url: str,
    file_name: str,
    caption: str = "",
) -> str:
    """Construye marcador JSON para envío de documento PDF por WhatsApp."""

    normalized_to = str(to or "").strip()
    normalized_url = str(document_url or "").strip()
    normalized_name = str(file_name or "").strip()
    if not normalized_to or not normalized_url or not normalized_name:
        return ""
    message: dict[str, str] = {
        "to": normalized_to,
        "type": "document",
        "documentUrl": normalized_url,
        "fileName": normalized_name,
    }
    normalized_caption = str(caption or "").strip()
    if normalized_caption:
        message["caption"] = normalized_caption
    return f"{WC_DOCUMENT_MARKER_PREFIX}{json.dumps(message, ensure_ascii=True)}"
