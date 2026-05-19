"""Contexto de tenant (owner) por request HTTP del motor del bot."""

from __future__ import annotations

from contextvars import ContextVar, Token

current_owner_user_id: ContextVar[str | None] = ContextVar("current_owner_user_id", default=None)


def get_owner_user_id() -> str:
    """Devuelve el owner del turno actual o cadena vacía."""

    value = current_owner_user_id.get()
    return str(value or "").strip()


def set_owner_user_id(value: str | None) -> Token:
    """Establece el owner del turno; retorna token para reset."""

    normalized = str(value or "").strip() or None
    return current_owner_user_id.set(normalized)


def reset_owner_user_id(token: Token | None) -> None:
    """Restaura el contextvar al valor anterior."""

    if token is not None:
        current_owner_user_id.reset(token)
