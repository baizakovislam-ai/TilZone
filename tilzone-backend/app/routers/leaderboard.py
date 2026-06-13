from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_optional_user   # ← опциональный
from app.database import get_db
from app.models.user import User
from app.schemas.leaderboard import LeaderboardEntry, LeaderboardResponse

router = APIRouter()


@router.get("", response_model=LeaderboardResponse)
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    by: str = Query(default="xp", pattern="^(xp|pvp)$"),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User | None = Depends(get_optional_user),   # ← не бросает 401
):
    order_col = User.elo if by == "pvp" else User.xp

    result = await db.execute(
        select(User)
        .where(User.is_active.is_(True))
        .order_by(desc(order_col))
        .limit(limit)
    )
    top_users = result.scalars().all()

    entries = [
        LeaderboardEntry(
            rank=i + 1,
            id=u.id,
            name=u.name,
            username=u.username,
            avatar=u.avatar,
            xp=u.xp,
            elo=u.elo,
            level=u.level,
            league=u.league,
            pvp_wins=u.pvp_wins,
            pvp_losses=u.pvp_losses,
            streak=u.streak,
            is_me=current_user is not None and u.id == current_user.id,
        )
        for i, u in enumerate(top_users)
    ]

    my_rank: int | None = None
    if current_user:
        me_in_top = any(e.is_me for e in entries)
        if not me_in_top:
            count_result = await db.execute(
                select(User).where(
                    User.is_active.is_(True),
                    order_col > getattr(current_user, "elo" if by == "pvp" else "xp"),
                )
            )
            ahead = len(count_result.scalars().all())
            my_rank = ahead + 1

    return LeaderboardResponse(entries=entries, my_rank=my_rank)