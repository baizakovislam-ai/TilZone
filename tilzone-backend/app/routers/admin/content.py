from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.learning import Lesson, Task, Theory, UserProgress
from app.models.user import User
from app.routers.admin.deps import require_admin

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class LessonCreate(BaseModel):
    title: str
    level: str = "A1"
    section: str = "Beginner"
    xp_reward: int = 20
    description: str | None = None
    order_index: int = 0
    is_published: bool = True


class LessonUpdate(BaseModel):
    title: str | None = None
    level: str | None = None
    section: str | None = None
    xp_reward: int | None = None
    description: str | None = None
    order_index: int | None = None
    is_published: bool | None = None


class TheoryCreate(BaseModel):
    category: str
    title: str
    content: str
    examples: str = ""
    lesson_id: int | None = None
    audio_url: str | None = None
    image_url: str | None = None
    order_index: int = 0
    is_published: bool = True


class TheoryUpdate(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None
    examples: str | None = None
    lesson_id: int | None = None
    audio_url: str | None = None
    image_url: str | None = None
    order_index: int | None = None
    is_published: bool | None = None


class TaskCreate(BaseModel):
    lesson_id: int
    task_type: str
    prompt: str
    answer: str
    options: str | None = None   # JSON string
    xp_reward: int = 5
    order_index: int = 0
    explanation: str | None = None


class TaskUpdate(BaseModel):
    lesson_id: int | None = None
    task_type: str | None = None
    prompt: str | None = None
    answer: str | None = None
    options: str | None = None
    xp_reward: int | None = None
    order_index: int | None = None
    explanation: str | None = None


# ── Lessons ────────────────────────────────────────────────────────────────────

@router.get("/lessons")
async def list_lessons(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    level: str | None = Query(None),
    is_published: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(Lesson)
    if search:
        q = q.where(Lesson.title.ilike(f"%{search}%"))
    if level:
        q = q.where(Lesson.level == level)
    if is_published is not None:
        q = q.where(Lesson.is_published.is_(is_published))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    q = q.order_by(Lesson.order_index, Lesson.id).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    lessons = result.scalars().all()

    # task count per lesson
    task_counts_result = await db.execute(
        select(Task.lesson_id, func.count(Task.id).label("cnt")).group_by(Task.lesson_id)
    )
    task_counts = {r.lesson_id: r.cnt for r in task_counts_result.all()}

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": l.id, "title": l.title, "level": l.level,
                "section": l.section, "xp_reward": l.xp_reward,
                "description": l.description, "order_index": l.order_index,
                "is_published": l.is_published,
                "task_count": task_counts.get(l.id, 0),
            }
            for l in lessons
        ],
    }


@router.post("/lessons", status_code=status.HTTP_201_CREATED)
async def create_lesson(
    payload: LessonCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    lesson = Lesson(**payload.model_dump())
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return {"id": lesson.id, "title": lesson.title}


@router.get("/lessons/{lesson_id}")
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    lesson = (await db.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    return lesson


@router.patch("/lessons/{lesson_id}")
async def update_lesson(
    lesson_id: int,
    payload: LessonUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    lesson = (await db.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(lesson, field, value)
    await db.commit()
    await db.refresh(lesson)
    return {"id": lesson.id, "title": lesson.title, "is_published": lesson.is_published}


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    lesson = (await db.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    await db.delete(lesson)
    await db.commit()


# ── Theory ─────────────────────────────────────────────────────────────────────

@router.get("/theory")
async def list_theory(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    lesson_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(Theory)
    if lesson_id:
        q = q.where(Theory.lesson_id == lesson_id)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    q = q.order_by(Theory.lesson_id, Theory.order_index).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {
                "id": t.id, "category": t.category, "title": t.title,
                "content": t.content, "examples": t.examples,
                "lesson_id": t.lesson_id, "order_index": t.order_index,
                "is_published": t.is_published,
                "audio_url": t.audio_url, "image_url": t.image_url,
            }
            for t in items
        ],
    }


@router.post("/theory", status_code=status.HTTP_201_CREATED)
async def create_theory(
    payload: TheoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    theory = Theory(**payload.model_dump())
    db.add(theory)
    await db.commit()
    await db.refresh(theory)
    return {"id": theory.id, "title": theory.title}


@router.patch("/theory/{theory_id}")
async def update_theory(
    theory_id: int,
    payload: TheoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    theory = (await db.execute(select(Theory).where(Theory.id == theory_id))).scalar_one_or_none()
    if not theory:
        raise HTTPException(status_code=404, detail="Теория не найдена")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(theory, field, value)
    await db.commit()
    await db.refresh(theory)
    return {"id": theory.id, "title": theory.title}


@router.delete("/theory/{theory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theory(
    theory_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    theory = (await db.execute(select(Theory).where(Theory.id == theory_id))).scalar_one_or_none()
    if not theory:
        raise HTTPException(status_code=404, detail="Теория не найдена")
    await db.delete(theory)
    await db.commit()


# ── Tasks ──────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    lesson_id: int | None = Query(None),
    task_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = select(Task)
    if lesson_id:
        q = q.where(Task.lesson_id == lesson_id)
    if task_type:
        q = q.where(Task.task_type == task_type)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    q = q.order_by(Task.lesson_id, Task.order_index).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {
                "id": t.id, "lesson_id": t.lesson_id, "task_type": t.task_type,
                "prompt": t.prompt, "answer": t.answer, "options": t.options,
                "xp_reward": t.xp_reward, "order_index": t.order_index,
                "explanation": t.explanation,
            }
            for t in items
        ],
    }


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    lesson = (await db.execute(select(Lesson).where(Lesson.id == payload.lesson_id))).scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    task = Task(**payload.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": task.id, "task_type": task.task_type}


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return {"id": task.id, "task_type": task.task_type}


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    await db.delete(task)
    await db.commit()