"""Compatibilidad temporal hacia brand_selection."""

from src.state import clientState

from src.nodes.brand_selection import brand_selection


def category_selection(state: clientState) -> clientState:
    """Alias legado para mantener compatibilidad externa."""

    return brand_selection(state)
