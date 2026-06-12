from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.learning import Lesson, Task, UserProgress
from app.models.activity import XPHistory
from app.models.user import User
from app.schemas.learning import (
    LessonRead,
    LessonWithProgressRead,
    TaskRead,
    TaskResult,
    TaskSubmit,
)

router = APIRouter()


@router.get("", response_model=list[LessonWithProgressRead])
async def list_lessons(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """
    Список всех опубликованных уроков.
    Если пользователь авторизован — добавляет его прогресс к каждому уроку.
    """
    result = await db.execute(
        select(Lesson).where(Lesson.is_published.is_(True)).order_by(Lesson.id)
    )
    lessons = result.scalars().all()

    # Загрузить прогресс текущего пользователя одним запросом
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

        # Определяем статус: completed / available / locked
        if prog and prog.completed:
            lesson_status = "completed"
        elif i == 0 or (i > 0 and progress_map.get(lessons[i - 1].id) and progress_map[lessons[i - 1].id].completed):
            lesson_status = "available"
        else:
            lesson_status = "locked"

        output.append(
            LessonWithProgressRead(
                id=lesson.id,
                title=lesson.title,
                level=lesson.level,
                section=lesson.section,
                xp_reward=lesson.xp_reward,
                status=lesson_status,
                score=prog.score if prog else 0,
                completed=prog.completed if prog else False,
            )
        )

    return output


@router.get("/{lesson_id}", response_model=LessonRead)
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    return lesson


@router.get("/{lesson_id}/tasks", response_model=list[TaskRead])
async def list_tasks(lesson_id: int, db: AsyncSession = Depends(get_db)):
    # Ensure lesson exists
    lesson_result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    if not lesson_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")

    result = await db.execute(
        select(Task).where(Task.lesson_id == lesson_id).order_by(Task.id)
    )
    return result.scalars().all()


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задание не найдено")

    correct = payload.answer.strip().lower() == task.answer.strip().lower()
    earned_xp = task.xp_reward if correct else 0

    if correct:
        current_user.xp += earned_xp
        current_user.level = max(1, current_user.xp // 100 + 1)
        db.add(XPHistory(user_id=current_user.id, action=f"task_{task_id}", amount=earned_xp))

        # Update or create UserProgress for the lesson
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
                user_id=current_user.id,
                lesson_id=task.lesson_id,
                completed=False,
                score=earned_xp,
            ))

        await db.commit()

    return TaskResult(correct=correct, expected=task.answer, earned_xp=earned_xp)


@router.post("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отмечает урок как полностью пройденный и начисляет XP за урок."""
    lesson_result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.is_published.is_(True))
    )
    lesson = lesson_result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")

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

        # Update streak
        current_user.streak = (current_user.streak or 0) + 1

        db.add(XPHistory(user_id=current_user.id, action=f"lesson_{lesson_id}_complete", amount=earned_xp))

        if prog:
            prog.completed = True
            prog.score = 100
        else:
            db.add(UserProgress(
                user_id=current_user.id,
                lesson_id=lesson_id,
                completed=True,
                score=100,
            ))

        await db.commit()

    return {
        "completed": True,
        "earned_xp": earned_xp,
        "total_xp": current_user.xp,
        "level": current_user.level,
        "streak": current_user.streak,
    }