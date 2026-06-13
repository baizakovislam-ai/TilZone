import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LessonRead(BaseModel):
    id: int
    title: str
    level: str
    section: str
    xp_reward: int
    description: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LessonWithProgressRead(LessonRead):
    """LessonRead + поля прогресса текущего пользователя."""
    status: str = "locked"   # completed | available | locked
    score: int = 0
    completed: bool = False


class TheoryRead(BaseModel):
    id: int
    category: str
    title: str
    content: str
    examples: str
    lesson_id: int | None = None
    audio_url: str | None = None
    image_url: str | None = None
    order_index: int = 0

    model_config = ConfigDict(from_attributes=True)


class TaskRead(BaseModel):
    id: int
    lesson_id: int
    task_type: str
    prompt: str
    xp_reward: int
    order_index: int = 0
    # options parsed from JSON string → list
    options: list[str] | None = None
    explanation: str | None = None
    # NOTE: answer is intentionally NOT returned to client

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def parse_options(cls, data: Any) -> Any:
        """Convert options JSON string → list when reading from ORM."""
        if hasattr(data, "__dict__"):
            # ORM object
            raw = getattr(data, "options", None)
            if isinstance(raw, str):
                try:
                    data.__dict__["options"] = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    data.__dict__["options"] = None
        elif isinstance(data, dict):
            raw = data.get("options")
            if isinstance(raw, str):
                try:
                    data["options"] = json.loads(raw)
                except (json.JSONDecodeError, ValueError):
                    data["options"] = None
        return data


class TaskSubmit(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


class TaskResult(BaseModel):
    correct: bool
    expected: str
    earned_xp: int
    explanation: str | None = None