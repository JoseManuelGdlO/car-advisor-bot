from typing import TypedDict


class BotState(TypedDict, total=False):
    user_input: str
    response: str
