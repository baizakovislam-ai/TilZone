from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_optional_user
from app.database import get_db
from app.models.learning import Lesson, Task, Theory, UserProgress
from app.models.activity import XPHistory
from app.models.user import User
from app.schemas.learning import (
    LessonRead,
    LessonWithProgressRead,
    TaskRead,
    TaskResult,
    TaskSubmit,
    TheoryRead,
)

router = APIRouter()


@router.get("", response_model=list[LessonWithProgressRead])
async def list_lessons(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    result = await db.execute(
        select(Lesson)
        .where(Lesson.is_published.is_(True))
        .order_by(Lesson.order_index, Lesson.id)
    )
    lessons = result.scalars().all()

    progress_map: dict[int, UserProgress] = {}
    if current_user:
        prog_result = await db.execute(
            select(UserProgress).where(UserProgress.user_id == current_user.id)
        )
        for p in prog_result.scalars().all():
            progress_map[p.lesson_id] = p

    output = []
    for i, lesson in enumerate(lessons):
        prog = progress_map.get(lesson.id)
        if prog and prog.completed:
            lesson_status = "completed"
        elif i == 0:
            lesson_status = "available"
        elif i > 0 and lessons[i-1].id in progress_map and progress_map[lessons[i-1].id].completed:
            lesson_status = "available"
        else:
            lesson_status = "locked"

        output.append(LessonWithProgressRead(
            id=lesson.id, title=lesson.title, level=lesson.level,
            section=lesson.section, xp_reward=lesson.xp_reward,
            description=lesson.description,
            status=lesson_status,
            score=prog.score if prog else 0,
            completed=prog.completed if prog else False,
        ))
    return output


@router.get("/{lesson_id}", response_model=LessonRead)
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    return lesson


@router.get("/{lesson_id}/tasks", response_model=list[TaskRead])
async def list_tasks(lesson_id: int, db: AsyncSession = Depends(get_db)):
    lesson_result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    if not lesson_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Урок не найден")
    result = await db.execute(
        select(Task).where(Task.lesson_id == lesson_id).order_by(Task.order_index, Task.id)
    )
    return result.scalars().all()


@router.get("/{lesson_id}/theory", response_model=list[TheoryRead])
async def lesson_theory(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Theory)
        .where(Theory.lesson_id == lesson_id, Theory.is_published.is_(True))
        .order_by(Theory.order_index, Theory.id)
    )
    return result.scalars().all()


def _answers_match(user_answer: str, correct_answer: str, task_type: str) -> bool:
    u = user_answer.strip().lower()
    c = correct_answer.strip().lower()
    if task_type == "matching":
        return sorted(x.strip() for x in u.split(",")) == sorted(x.strip() for x in c.split(","))
    return u == c


@router.post("/tasks/{task_id}/submit", response_model=TaskResult)
async def submit_task(
    task_id: int,
    payload: TaskSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задание не найдено")

    correct = _answers_match(payload.answer, task.answer, task.task_type)
    earned_xp = task.xp_reward if correct else 0

    if correct:
        current_user.xp += earned_xp
        current_user.level = max(1, current_user.xp // 100 + 1)
        db.add(XPHistory(user_id=current_user.id, action=f"task_{task_id}", amount=earned_xp))

        prog_result = await db.execute(
            select(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.lesson_id == task.lesson_id,
            )
        )
        prog = prog_result.scalar_one_or_none()
        if prog:
            prog.score = min(100, prog.score + earned_xp)
        else:
            db.add(UserProgress(
                user_id=current_user.id, lesson_id=task.lesson_id,
                completed=False, score=earned_xp,
            ))
        await db.commit()

    return TaskResult(
        correct=correct, expected=task.answer,
        earned_xp=earned_xp,
        explanation=task.explanation if not correct else None,
    )


@router.post("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: int,
    request: Request,                              # ← читаем токен напрямую
    db: AsyncSession = Depends(get_db),
):
    """
    Завершение урока. Авторизация через заголовок Authorization вручную,
    чтобы обойти проблему с auto_error в OAuth2PasswordBearer.
    """
    from app.core.security import decode_token
    from jose import JWTError

    # Достаём токен из заголовка вручную
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"error": {"code": "unauthorized", "message": "Токен отсутствует", "details": {}}})

    token = auth_header.split(" ", 1)[1]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("not access token")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("no sub")
    except (JWTError, ValueError, Exception):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"error": {"code": "unauthorized", "message": "Токен недействителен", "details": {}}})

    user_result = await db.execute(select(User).where(User.id == user_id))
    current_user = user_result.scalar_one_or_none()
    if not current_user or not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"error": {"code": "unauthorized", "message": "Пользователь не найден", "details": {}}})

    # Сам урок
    lesson_result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    lesson = lesson_result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    prog_result = await db.execute(
        select(UserProgress).where(
            UserProgress.user_id == current_user.id,
            UserProgress.lesson_id == lesson_id,
        )
    )
    prog = prog_result.scalar_one_or_none()
    already_completed = prog and prog.completed
    earned_xp = 0

    if not already_completed:
        earned_xp = lesson.xp_reward
        current_user.xp += earned_xp
        current_user.level = max(1, current_user.xp // 100 + 1)
        current_user.streak = (current_user.streak or 0) + 1
        db.add(XPHistory(
            user_id=current_user.id,
            action=f"lesson_{lesson_id}_complete",
            amount=earned_xp,
        ))
        if prog:
            prog.completed = True
            prog.score = 100
        else:
            db.add(UserProgress(
                user_id=current_user.id, lesson_id=lesson_id,
                completed=True, score=100,
            ))
        await db.commit()

    return {
        "completed": True,
        "earned_xp": earned_xp,
        "total_xp": current_user.xp,
        "level": current_user.level,
        "streak": current_user.streak,
    }