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
    return max(1, _PHONE_MIN)


def extract_name(text: str) -> str:
    t = " ".join((text or "").strip().split())
    t = re.sub(
        r"^(me\s+llamo|soy|mi\s+nombre\s+es)\s*[,:\-]?\s*",
        "",
        t,
        flags=re.IGNORECASE,
    )
    return " ".join(t.strip().split())


def is_initial_only_name(name: str) -> bool:
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
    return "".join(c for c in (text or "") if c.isdigit())


def is_valid_phone_digits(digits: str) -> bool:
    if not digits or not digits.isdigit():
        return False
    return len(digits) >= phone_min_digits()


def normalize_email(text: str) -> str:
    t = (text or "").strip()
    t = t.strip('"<>\'')
    t = t.rstrip(".,;)")
    return " ".join(t.split())


def is_valid_email(text: str) -> bool:
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
    t = normalize_email(text)
    local, _, domain = t.partition("@")
    return f"{local.lower()}@{domain.lower()}"
