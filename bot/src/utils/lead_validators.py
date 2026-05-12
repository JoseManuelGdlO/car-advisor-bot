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


_NAME_PREFIX_PATTERNS: tuple[str, ...] = (
    r"^(?:si|sí|claro|ok|okay|okey|perfecto|vale|bueno|pues|listo|gracias|hola|buenas|buenos\s+dias|buenos\s+días|buenas\s+tardes|buenas\s+noches)\b[\s,.:;\-]*",
    r"^(?:mi\s+nombre(?:\s+completo)?\s+es|mi\s+nombre(?:\s+completo)?|me\s+llamo|me\s+dicen|soy|nombre(?:\s+completo)?\s*[:\-]?|es)\b[\s,.:;\-]*",
    r"^(?:mi\s+(?:correo|email|e-mail|telefono|teléfono|numero|número|celular|cel)(?:\s+(?:electronico|electrónico))?\s*(?:es)?|correo(?:\s+electronico|\s+electrónico)?\s*[:\-]?|email\s*[:\-]?|telefono\s*[:\-]?|teléfono\s*[:\-]?|numero\s*[:\-]?|número\s*[:\-]?|celular\s*[:\-]?)\b[\s,.:;\-]*",
)


_NAME_TRAILING_SECONDARY_PREFIX = re.compile(
    r"(?:^|[\s,.:;\-])(?:mi\s+(?:correo|email|e-mail|telefono|teléfono|numero|número|celular|cel)\b"
    r"|correo(?:\s+electronico|\s+electrónico)?\b|email\b|telefono\b|teléfono\b"
    r"|numero\b|número\b|celular\b|cel\b)",
    flags=re.IGNORECASE,
)


def _truncate_at_phone_or_email(text: str) -> str:
    """Recorta el texto en el primer '@', secuencia >=4 dígitos o sub-prefijo de otro dato."""

    if not text:
        return ""
    at_idx = text.find("@")
    if at_idx != -1:
        word_start = text.rfind(" ", 0, at_idx) + 1
        text = text[:word_start].rstrip()
    digits_match = re.search(r"\d{4,}", text)
    if digits_match:
        text = text[: digits_match.start()].rstrip()
    secondary = _NAME_TRAILING_SECONDARY_PREFIX.search(text)
    if secondary and secondary.start() > 0:
        text = text[: secondary.start()].rstrip()
    return text


def extract_name(text: str) -> str:
    """Extrae name desde la entrada del usuario."""
    t = " ".join((text or "").strip().split())
    if not t:
        return ""
    t = _truncate_at_phone_or_email(t)
    if not t:
        return ""
    # Normaliza puntuacion habitual (¿¡!?*~"'.,:; etc.) a espacios para que los
    # prefijos conversacionales sean reconocibles sin importar como se decoren.
    t = re.sub(r"[^A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9'\-\s]", " ", t)
    t = " ".join(t.split())
    if not t:
        return ""
    changed = True
    while changed:
        changed = False
        for pattern in _NAME_PREFIX_PATTERNS:
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
    # Limpieza final: solo letras, espacios, apostrofes y guiones.
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
