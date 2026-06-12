import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.activity import AIChat, XPHistory
from app.models.user import User
from app.schemas.activity import AIChatRequest, AIChatResponse
from app.services.ai_service import call_ai_chat

logger = logging.getLogger(__name__)
router = APIRouter()


def _calc_xp(message: str) -> int:
    words = len(message.split())
    if words >= 10: return 15
    if words >= 5:  return 10
    return 5


def _estimate_level(xp: int) -> str:
    if xp < 100:  return "A1"
    if xp < 300:  return "A2"
    if xp < 700:  return "B1"
    if xp < 1500: return "B2"
    return "C1"


@router.post("/chat", response_model=AIChatResponse)
async def chat(
    payload: AIChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    study_language  = current_user.study_language  or "en"
    native_language = current_user.native_language or "ru"
    level           = _estimate_level(current_user.xp)

    history = [{"role": msg.role, "content": msg.content} for msg in payload.history]

    try:
        result = call_ai_chat(
            message=payload.message,
            scenario=payload.scenario,
            history=history,
            study_language=study_language,
            native_language=native_language,
            level=level,
        )
    except RuntimeError as e:
        logger.error("AI service error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "ai_unavailable", "message": str(e), "details": {}}},
        )

    earned_xp = _calc_xp(payload.message)
    current_user.xp   += earned_xp
    current_user.level = max(1, current_user.xp // 100 + 1)

    db.add(AIChat(
        user_id=current_user.id,
        scenario=payload.scenario,
        message=payload.message,
        response=result["response"],
    ))
    db.add(XPHistory(
        user_id=current_user.id,
        action=f"ai_chat_{payload.scenario[:20]}",
        amount=earned_xp,
    ))
    await db.commit()

    return AIChatResponse(
        response=result["response"],
        correction=result.get("correction"),
        level_hint=result.get("level_hint", level),
        earned_xp=earned_xp,
    )


@router.get("/history")
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
):
    result = await db.execute(
        select(AIChat)
        .where(AIChat.user_id == current_user.id)
        .order_by(desc(AIChat.created_at))
        .limit(limit)
    )
    chats = result.scalars().all()
    return [
        {"id": c.id, "scenario": c.scenario, "message": c.message,
         "response": c.response, "created_at": str(c.created_at)}
        for c in chats
    ]