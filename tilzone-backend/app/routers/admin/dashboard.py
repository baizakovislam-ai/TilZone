from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.activity import AIChat, PvPMatch, XPHistory
from app.models.learning import Lesson, Task, Theory, UserProgress
from app.models.user import User
from app.routers.admin.deps import require_admin

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar()
    active_users = (await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))).scalar()
    verified_users = (await db.execute(select(func.count()).select_from(User).where(User.is_verified.is_(True)))).scalar()

    total_lessons = (await db.execute(select(func.count()).select_from(Lesson))).scalar()
    published_lessons = (await db.execute(select(func.count()).select_from(Lesson).where(Lesson.is_published.is_(True)))).scalar()

    total_tasks = (await db.execute(select(func.count()).select_from(Task))).scalar()
    total_theory = (await db.execute(select(func.count()).select_from(Theory))).scalar()
    completions = (await db.execute(select(func.count()).select_from(UserProgress).where(UserProgress.completed.is_(True)))).scalar()
    total_pvp = (await db.execute(select(func.count()).select_from(PvPMatch))).scalar()
    total_ai_chats = (await db.execute(select(func.count()).select_from(AIChat))).scalar()

    total_xp = (await db.execute(select(func.coalesce(func.sum(XPHistory.amount), 0)))).scalar()

    # Top 5 users by XP
    top_users_result = await db.execute(
        select(User.username, User.xp, User.level, User.league)
        .order_by(User.xp.desc())
        .limit(5)
    )
    top_users = [
        {"username": r.username, "xp": r.xp, "level": r.level, "league": r.league}
        for r in top_users_result.all()
    ]

    # Recent registrations (last 7)
    recent_result = await db.execute(
        select(User.username, User.email, User.created_at, User.is_verified)
        .order_by(User.created_at.desc())
        .limit(7)
    )
    recent_users = [
        {"username": r.username, "email": r.email, "created_at": str(r.created_at), "is_verified": r.is_verified}
        for r in recent_result.all()
    ]

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "verified": verified_users,
        },
        "content": {
            "lessons": total_lessons,
            "published_lessons": published_lessons,
            "tasks": total_tasks,
            "theory": total_theory,
        },
        "activity": {
            "completions": completions,
            "pvp_matches": total_pvp,
            "ai_chats": total_ai_chats,
            "total_xp_earned": total_xp,
        },
        "top_users": top_users,
        "recent_users": recent_users,
    }