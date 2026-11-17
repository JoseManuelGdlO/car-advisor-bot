"""Detector heuristico de formularios de lead (Meta ads / CTWA)."""

from __future__ import annotations

import re

from src.tools.vehicles import normalize_user_text

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_NAME_LINE_RE = re.compile(r"nombre\s*:\s*(.+)", re.IGNORECASE)
_BUDGET_LIMIT_RE = re.compile(
    r"(menor\s+a|menos\s+de|hasta)\s+\$?\s*\d[\d.,]*",
    re.IGNORECASE,
)
_BUDGET_LABELED_RE = re.compile(
    r"presupuesto(?:\s+(?:maximo|máximo|aproximado|de|es))?\s+\$?\s*\d[\d.,]*",
    re.IGNORECASE,
)
_DIGIT_RUN_RE = re.compile(r"\d[\d\s\-().]{6,}")
_FINANCING_RE = re.compile(r"\bfinanci(?:amiento|ado)\b", re.IGNORECASE)

_TIMELINE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"0\s*[-–]\s*3\s*meses", re.IGNORECASE), "0-3 meses"),
    (re.compile(r"0\s+a\s+3\s*meses", re.IGNORECASE), "0-3 meses"),
    (re.compile(r"3\s*[-–]\s*6\s*meses", re.IGNORECASE), "3-6 meses"),
    (re.compile(r"3\s+a\s+6\s*meses", re.IGNORECASE), "3-6 meses"),
    (re.compile(r"\binmediato\b", re.IGNORECASE), "inmediato"),
    (re.compile(r"\beste\s+mes\b", re.IGNORECASE), "este mes"),
)


def _extract_email(text: str) -> str:
    match = _EMAIL_RE.search(text)
    return match.group(0).strip() if match else ""


def _span_is_budget_amount(text: str, start: int) -> bool:
    prefix = text[max(0, start - 24) : start].lower()
    immediate = text[max(0, start - 2) : start]
    if "$" in immediate:
        return True
    return "presupuesto" in prefix


def _extract_phone(text: str) -> str:
    for match in _DIGIT_RUN_RE.finditer(text):
        if _span_is_budget_amount(text, match.start()):
            continue
        digits = re.sub(r"\D", "", match.group(0))
        if len(digits) == 10:
            return digits
        if len(digits) == 12 and digits.startswith("52"):
            return digits
    return ""


def _extract_nombre(text: str) -> str:
    match = _NAME_LINE_RE.search(text)
    if not match:
        return ""
    return str(match.group(1) or "").strip().splitlines()[0].strip()


def _has_budget(raw: str, normalized: str) -> bool:
    if "presupuesto" in normalized:
        return True
    if _BUDGET_LIMIT_RE.search(raw):
        return True
    return bool(re.search(r"\b(menor a|menos de|hasta)\s+\d", normalized))


def _extract_presupuesto(raw: str) -> str:
    match = _BUDGET_LIMIT_RE.search(raw)
    if match:
        return re.sub(r"\s+", " ", match.group(0)).strip().lower()
    match = _BUDGET_LABELED_RE.search(raw)
    if match:
        return re.sub(r"\s+", " ", match.group(0)).strip().lower()
    return ""


def _extract_plazo_compra(raw: str, normalized: str) -> str:
    for pattern, label in _TIMELINE_PATTERNS:
        if pattern.search(raw):
            return label
    if "inmediato" in normalized:
        return "inmediato"
    if "este mes" in normalized:
        return "este mes"
    if "compra" in normalized and "meses" in normalized:
        window = re.search(r"(\d+)\s+(\d+)\s+meses", normalized)
        if window:
            return f"{window.group(1)}-{window.group(2)} meses"
    return ""


def _has_timeline(raw: str, normalized: str) -> bool:
    if _extract_plazo_compra(raw, normalized):
        return True
    return "compra" in normalized and "meses" in normalized


def _extract_payment_type(raw: str, normalized: str) -> str:
    if _FINANCING_RE.search(raw) or "financiamiento" in normalized or "financiado" in normalized:
        return "financiado"
    return ""


def detect_lead_intake(text: str) -> dict[str, str] | None:
    """Detecta un formulario de lead y extrae campos presentes. None si no hay match."""

    raw = str(text or "").strip()
    if not raw:
        return None
    normalized = normalize_user_text(raw)
    email = _extract_email(raw)
    phone = _extract_phone(raw)
    has_contact = bool(email and phone)
    has_budget_timeline = _has_budget(raw, normalized) and _has_timeline(raw, normalized)
    if not has_contact and not has_budget_timeline:
        return None

    extracted: dict[str, str] = {"matched_by": "contact" if has_contact else "budget_timeline"}
    fields = {
        "nombre": _extract_nombre(raw),
        "telefono": phone,
        "email": email,
        "presupuesto": _extract_presupuesto(raw),
        "plazo_compra": _extract_plazo_compra(raw, normalized),
        "payment_type": _extract_payment_type(raw, normalized),
    }
    for key, value in fields.items():
        cleaned = str(value or "").strip()
        if cleaned:
            extracted[key] = cleaned
    return extracted
