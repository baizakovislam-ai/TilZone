from pydantic import BaseModel, Field


# ── AI Chat ───────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """Одно сообщение в истории диалога."""
    role: str   # "user" | "assistant"
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    scenario: str = Field(default="☕ Кафе", max_length=80)
    # История предыдущих сообщений (без текущего)
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)


class AIChatResponse(BaseModel):
    response:   str
    correction: str | None = None
    level_hint: str = "A1"
    earned_xp:  int = 0


# ── PvP ───────────────────────────────────────────────────────

class MatchmakingRequest(BaseModel):
    match_type: str = Field(default="1v1", pattern="^(1v1|multiplayer|speed|grammar|vocabulary)$")


class MatchmakingResponse(BaseModel):
    match_id:   int
    status:     str
    match_type: str


class PvPAnswerRequest(BaseModel):
    correct: bool


class PvPAnswerResponse(BaseModel):
    elo:       int
    earned_xp: int
    result:    str