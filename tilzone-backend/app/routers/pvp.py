from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.activity import PvPMatch
from app.models.user import User
from app.schemas.activity import MatchmakingRequest, MatchmakingResponse, PvPAnswerRequest, PvPAnswerResponse

router = APIRouter()


@router.post("/matchmaking", response_model=MatchmakingResponse)
async def matchmaking(
    payload: MatchmakingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    match = PvPMatch(match_type=payload.match_type, status="waiting")
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return MatchmakingResponse(match_id=match.id, status=match.status, match_type=match.match_type)


@router.post("/submit-answer", response_model=PvPAnswerResponse)
async def submit_answer(
    payload: PvPAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.correct:
        current_user.elo += 25
        current_user.xp += 40
        current_user.pvp_wins += 1
        result = "win"
        earned_xp = 40
    else:
        current_user.elo = max(0, current_user.elo - 15)
        current_user.pvp_losses += 1
        result = "loss"
        earned_xp = 0
    await db.commit()
    return PvPAnswerResponse(elo=current_user.elo, earned_xp=earned_xp, result=result)
