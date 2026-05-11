"""Helpers compartidos para URLs de imagen y marcadores WhatsApp."""

from __future__ import annotations

import json
import os
import re
from urllib.parse import urlsplit, urlunsplit
from typing import Any

from src.tools.vehicles import build_whatsapp_image_messages
from src.utils.signals import WC_IMAGE_MARKER_PREFIX


def normalize_image_url_for_chat(raw_url: str) -> str:
    """Normaliza URL de imagen relativa/absoluta al host backend."""

    cleaned = str(raw_url or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    backend_api_url = str(os.getenv("BACKEND_API_URL", "")).strip()
    if backend_api_url:
        parts = urlsplit(backend_api_url)
        path = re.sub(r"/api/?$", "", parts.path or "", flags=re.IGNORECASE) or ""
        base = urlunsplit((parts.scheme, parts.netloc, path, "", "")).rstrip("/")
    else:
        base = "http://localhost:4000"
    if cleaned.startswith("/"):
        return f"{base}{cleaned}"
    return f"{base}/{cleaned}"


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
