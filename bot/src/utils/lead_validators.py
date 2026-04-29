"""Validaciones deterministas para captura de lead (nombre, telefono, email)."""

from __future__ import annotations

import os
import re
from typing import Optional

_PHONE_MIN = int(os.getenv("LEAD_PHONE_MIN_DIGITS", "10") or "10")

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$"
)


def phone_min_digits() -> int:
    """Helper de apoyo para phone min digits."""
    return max(1, _PHONE_MIN)


def extract_name(text: str) -> str:
    """Extrae name desde la entrada del usuario."""
    t = " ".join((text or "").strip().split())
    if not t:
        return ""
    t = re.sub(
        r"^[\s,.:;\-]+",
        "",
        t,
        flags=re.IGNORECASE,
    )
    # Quita prefijos conversacionales frecuentes para conservar solo el nombre.
    prefix_patterns = [
        r"^(?:si|sí|claro|ok|okay|perfecto|vale|bueno|pues)\b[\s,.:;\-]*",
        r"^(?:mi\s+nombre(?:\s+completo)?\s+es|me\s+llamo|soy|nombre(?:\s+completo)?\s*[:\-]?|es)\b[\s,.:;\-]*",
    ]
    changed = True
    while changed:
        changed = False
        for pattern in prefix_patterns:
            updated = re.sub(pattern, "", t, flags=re.IGNORECASE)
            if updated != t:
                t = updated.strip()
                changed = True
    # Si viene en formato "ok, mi nombre es X", intenta quedarte con el ultimo tramo.
    if "," in t:
        chunks = [chunk.strip() for chunk in t.split(",") if chunk.strip()]
        if chunks:
            tail = chunks[-1]
            if len(tail.split()) >= 2:
                t = tail
    # Limpia todo excepto letras, espacios, apostrofes y guiones.
    t = re.sub(r"[^A-Za-zÁÉÍÓÚáéíóúÑñÜü'\-\s]", " ", t)
    return " ".join(t.strip().split())


def is_initial_only_name(name: str) -> bool:
    """Retorna True cuando is initial only name."""
    if not name:
        return False
    parts = [p for p in name.split() if p]
    if len(parts) < 2:
        return False
    for p in parts:
        core = p.rstrip(".")
        if len(core) != 1 or not core.isalpha():
            return False
    return True


def is_valid_full_name(name: str) -> bool:
    """Retorna True cuando is valid full name."""
    if not name:
        return False
    parts = [part for part in name.split() if part]
    if len(parts) < 2:
        return False
    if is_initial_only_name(name):
        return False
    letters = re.findall(r"[A-Za-zÁÉÍÓÚáéíóúÑñÜü]", name)
    if len(letters) < 3:
        return False
    return True


def extract_phone_digits(text: str) -> str:
    """Extrae phone digits desde la entrada del usuario."""
    return "".join(c for c in (text or "") if c.isdigit())


def is_valid_phone_digits(digits: str) -> bool:
    """Retorna True cuando is valid phone digits."""
    if not digits or not digits.isdigit():
        return False
    return len(digits) >= phone_min_digits()


def normalize_email(text: str) -> str:
    """Normaliza email para mantener consistencia."""
    t = (text or "").strip()
    t = t.strip('"<>\'')
    t = t.rstrip(".,;)")
    return " ".join(t.split())


def is_valid_email(text: str) -> bool:
    """Retorna True cuando is valid email."""
    if not text or "@" not in text:
        return False
    t = normalize_email(text)
    if "@" not in t:
        return False
    local, _, domain = t.partition("@")
    if not local or not domain or " " in t:
        return False
    candidate = f"{local.lower()}@{domain.lower()}"
    return bool(_EMAIL_RE.match(candidate))


def normalize_stored_email(text: str) -> str:
    """Normaliza stored email para mantener consistencia."""
    t = normalize_email(text)
    local, _, domain = t.partition("@")
    return f"{local.lower()}@{domain.lower()}"


def extract_email(text: str) -> str:
    """Extrae el primer correo valido embebido en texto libre."""

    raw = str(text or "").strip()
    if not raw:
        return ""
    match = re.search(
        r"([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+)",
        raw,
    )
    if not match:
        return ""
    return normalize_stored_email(match.group(1))
