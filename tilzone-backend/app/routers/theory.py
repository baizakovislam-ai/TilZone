from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.learning import Theory
from app.schemas.learning import TheoryRead

router = APIRouter()


@router.get("", response_model=list[TheoryRead])
async def list_theory(
    db: AsyncSession = Depends(get_db),
    category: str | None = Query(default=None, description="Фильтр по категории"),
):
    stmt = select(Theory).where(Theory.is_published.is_(True))
    if category:
        stmt = stmt.where(Theory.category == category)
    stmt = stmt.order_by(Theory.order_index, Theory.id)

    result = await db.execute(stmt)
    theory = result.scalars().all()

    if theory:
        return theory

    # Fallback — встроенная теория, если БД пуста
    return [
        TheoryRead(id=1, category="tenses", title="Present Simple",
                   content=(
                       "<h3>Present Simple — настоящее простое</h3>"
                       "<p>Используется для привычных действий, фактов и расписаний.</p>"
                       "<h4>Структура:</h4>"
                       "<ul><li><b>I/You/We/They</b> + глагол: <em>I work</em></li>"
                       "<li><b>He/She/It</b> + глагол + <b>-s/-es</b>: <em>He works</em></li></ul>"
                       "<h4>Отрицание:</h4>"
                       "<p>I <b>don't</b> work. / He <b>doesn't</b> work.</p>"
                       "<h4>Вопрос:</h4>"
                       "<p><b>Do</b> you work? / <b>Does</b> he work?</p>"
                   ),
                   examples="I go to school every day.\nShe studies English.\nThey don't watch TV.",
                   lesson_id=None),
        TheoryRead(id=2, category="tenses", title="Present Continuous",
                   content=(
                       "<h3>Present Continuous — настоящее продолжённое</h3>"
                       "<p>Используется для действий, происходящих прямо сейчас или временно.</p>"
                       "<h4>Структура:</h4>"
                       "<p><b>am/is/are</b> + глагол + <b>-ing</b></p>"
                       "<ul><li>I <b>am</b> work<b>ing</b></li>"
                       "<li>He <b>is</b> study<b>ing</b></li>"
                       "<li>They <b>are</b> play<b>ing</b></li></ul>"
                   ),
                   examples="I am reading now.\nShe is cooking dinner.\nWe are learning English.",
                   lesson_id=None),
        TheoryRead(id=3, category="tenses", title="Past Simple",
                   content=(
                       "<h3>Past Simple — прошедшее простое</h3>"
                       "<p>Используется для завершённых действий в прошлом.</p>"
                       "<h4>Правильные глаголы:</h4>"
                       "<p>глагол + <b>-ed</b>: work → work<b>ed</b>, play → play<b>ed</b></p>"
                       "<h4>Неправильные глаголы (2-я форма):</h4>"
                       "<p>go → <b>went</b>, see → <b>saw</b>, take → <b>took</b></p>"
                   ),
                   examples="I worked yesterday.\nShe went to school.\nThey saw a movie.",
                   lesson_id=None),
        TheoryRead(id=4, category="articles", title="A / An / The",
                   content=(
                       "<h3>Артикли в английском языке</h3>"
                       "<h4>Неопределённый артикль A / AN:</h4>"
                       "<ul><li><b>a</b> — перед согласными: a <em>book</em>, a <em>cat</em></li>"
                       "<li><b>an</b> — перед гласными: an <em>apple</em>, an <em>egg</em></li></ul>"
                       "<h4>Определённый артикль THE:</h4>"
                       "<p>Используется для конкретного, уже известного объекта.</p>"
                       "<p>the sun, the moon, the President</p>"
                       "<h4>Без артикля:</h4>"
                       "<p>Имена собственные, языки, спорт: English, football, Russia</p>"
                   ),
                   examples="I have a cat.\nThe cat is black.\nShe is an engineer.",
                   lesson_id=None),
        TheoryRead(id=5, category="pronouns", title="Personal Pronouns",
                   content=(
                       "<h3>Личные местоимения</h3>"
                       "<table style='width:100%;border-collapse:collapse'>"
                       "<tr><th>Субъект</th><th>Объект</th><th>Притяжательное</th></tr>"
                       "<tr><td>I</td><td>me</td><td>my / mine</td></tr>"
                       "<tr><td>you</td><td>you</td><td>your / yours</td></tr>"
                       "<tr><td>he</td><td>him</td><td>his</td></tr>"
                       "<tr><td>she</td><td>her</td><td>her / hers</td></tr>"
                       "<tr><td>we</td><td>us</td><td>our / ours</td></tr>"
                       "<tr><td>they</td><td>them</td><td>their / theirs</td></tr>"
                       "</table>"
                   ),
                   examples="I see him. She loves her cat. They gave us a gift.",
                   lesson_id=None),
        TheoryRead(id=6, category="verbs", title="Modal Verbs",
                   content=(
                       "<h3>Модальные глаголы</h3>"
                       "<p>Модальные глаголы не изменяются по лицам и числам.</p>"
                       "<h4>Основные модальные глаголы:</h4>"
                       "<ul>"
                       "<li><b>can</b> — могу, умею: I <em>can</em> swim.</li>"
                       "<li><b>must</b> — должен: You <em>must</em> study.</li>"
                       "<li><b>should</b> — следует: You <em>should</em> sleep more.</li>"
                       "<li><b>may/might</b> — может быть: It <em>may</em> rain.</li>"
                       "<li><b>will</b> — будущее: I <em>will</em> call you.</li>"
                       "</ul>"
                   ),
                   examples="She can speak English.\nYou must do homework.\nI will help you.",
                   lesson_id=None),
    ]


@router.get("/categories", response_model=list[str])
async def list_categories(db: AsyncSession = Depends(get_db)):
    """Список уникальных категорий теории."""
    result = await db.execute(
        select(Theory.category).where(Theory.is_published.is_(True)).distinct()
    )
    cats = [row[0] for row in result.all()]
    return cats or ["tenses", "articles", "pronouns", "verbs", "phrases", "pronunciation"]