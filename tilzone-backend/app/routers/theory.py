from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.learning import Theory
from app.schemas.learning import TheoryRead

router = APIRouter()


@router.get("", response_model=list[TheoryRead])
async def list_theory(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Theory).order_by(Theory.id))
    theory = result.scalars().all()
    if theory:
        return theory
    return [
        TheoryRead(
            id=1,
            category="tenses",
            title="Present Simple",
            content="Use Present Simple for habits, facts, and repeated actions.",
            examples="He goes to school. I study English every day.",
            lesson_id=None,
        ),
        TheoryRead(
            id=2,
            category="articles",
            title="A / An / The",
            content="Use a/an for one non-specific object and the for a known object.",
            examples="a book, an apple, the sun",
            lesson_id=None,
        ),
    ]
