from pydantic import BaseModel, ConfigDict, Field


class LessonRead(BaseModel):
    id: int
    title: str
    level: str
    section: str
    xp_reward: int

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

    model_config = ConfigDict(from_attributes=True)


class TaskRead(BaseModel):
    id: int
    lesson_id: int
    task_type: str
    prompt: str
    xp_reward: int
    # NOTE: answer is intentionally NOT returned to client

    model_config = ConfigDict(from_attributes=True)


class TaskSubmit(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


class TaskResult(BaseModel):
    correct: bool
    expected: str
    earned_xp: int