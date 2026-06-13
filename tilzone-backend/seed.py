#!/usr/bin/env python3
"""
TilZone seed script.
Запуск: cd tilzone-backend && python seed.py
"""

import asyncio
import json
import sys

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.learning import Lesson, Task, Theory

engine = create_async_engine(settings.database_url, echo=False)
AsyncSession_ = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

# ── УРОКИ ──────────────────────────────────────────────────────
LESSONS = [
    (1,  "Алфавит и произношение",     "A1", "Beginner",        15, "Буквы, звуки и базовое произношение",         0),
    (2,  "Приветствия",                 "A1", "Beginner",        20, "Hello, Hi, Good morning — первые фразы",      1),
    (3,  "Числа 1–20",                  "A1", "Beginner",        20, "Считаем от 1 до 20 на английском",            2),
    (4,  "Цвета и формы",               "A1", "Beginner",        20, "Red, blue, circle, square...",                3),
    (5,  "Present Simple",              "A1", "Beginner",        25, "Привычные действия и факты",                  4),
    (6,  "To be — глагол быть",         "A1", "Beginner",        25, "I am, you are, he is...",                     5),
    (7,  "Местоимения",                 "A2", "Elementary",      25, "I, you, he, she, we, they...",                6),
    (8,  "Present Continuous",          "A2", "Elementary",      30, "Что происходит прямо сейчас",                 7),
    (9,  "Артикли A/An/The",            "A2", "Elementary",      30, "Определённые и неопределённые артикли",       8),
    (10, "Past Simple",                 "A2", "Elementary",      35, "Что случилось вчера и раньше",                9),
    (11, "Модальные глаголы",           "B1", "Pre-Intermediate",35, "Can, must, should, may...",                   10),
    (12, "Future Simple",               "B1", "Pre-Intermediate",35, "Will — планы и предсказания",                 11),
    (13, "Неправильные глаголы",        "B1", "Pre-Intermediate",40, "Go-went-gone и другие",                       12),
    (14, "Вопросительные предложения",  "B1", "Pre-Intermediate",40, "How, What, Where, When, Why...",              13),
    (15, "Present Perfect",             "B2", "Intermediate",    50, "Have/has + V3",                               14),
]

# ── ТЕОРИЯ ─────────────────────────────────────────────────────
THEORY = [
    ("tenses", "Present Simple — основы",
     "<h3>Present Simple</h3><p>Используется для привычных действий, фактов и расписаний.</p>"
     "<h4>Структура:</h4><table style='width:100%;border-collapse:collapse;border:1px solid #e5e7eb'>"
     "<tr style='background:#f9fafb'><th style='padding:8px;border:1px solid #e5e7eb'>Лицо</th><th style='padding:8px;border:1px solid #e5e7eb'>Утверждение</th><th style='padding:8px;border:1px solid #e5e7eb'>Отрицание</th></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>I/You/We/They</td><td style='padding:8px;border:1px solid #e5e7eb'>I <b>work</b></td><td style='padding:8px;border:1px solid #e5e7eb'>I <b>don't</b> work</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>He/She/It</td><td style='padding:8px;border:1px solid #e5e7eb'>He <b>works</b></td><td style='padding:8px;border:1px solid #e5e7eb'>He <b>doesn't</b> work</td></tr>"
     "</table><p style='margin-top:12px'><b>Важно:</b> В 3-м лице ед.ч. (he/she/it) добавляем <b>-s/-es</b>.</p>",
     "I play football. / She plays tennis.\nHe goes to school. / They don't watch TV.", 5, 0),

    ("tenses", "Present Continuous",
     "<h3>Present Continuous</h3><p>Для действий прямо сейчас или временных ситуаций.</p>"
     "<h4>Структура: am/is/are + глагол + -ing</h4><ul>"
     "<li>I <b>am</b> work<b>ing</b></li><li>He/She/It <b>is</b> study<b>ing</b></li><li>You/We/They <b>are</b> play<b>ing</b></li></ul>"
     "<h4>Правила -ing:</h4><ul><li>work → work<b>ing</b></li><li>make → mak<b>ing</b> (убираем -e)</li><li>run → runn<b>ing</b> (удваиваем согл.)</li></ul>",
     "I am eating now. / She is studying. / They are playing.", 8, 0),

    ("tenses", "Past Simple",
     "<h3>Past Simple</h3><p>Для завершённых действий в прошлом.</p>"
     "<h4>Правильные глаголы: + -ed</h4><p>work → worked, play → played, study → studied</p>"
     "<h4>Неправильные (2-я форма):</h4><ul><li>go → <b>went</b></li><li>see → <b>saw</b></li>"
     "<li>take → <b>took</b></li><li>come → <b>came</b></li><li>have → <b>had</b></li><li>do → <b>did</b></li></ul>"
     "<h4>Отрицание и вопрос: did</h4><p>I <b>didn't</b> go. / <b>Did</b> you go?</p>",
     "I worked yesterday. / She went to school. / Did you see him?", 10, 0),

    ("articles", "Артикли: A, An, The",
     "<h3>Артикли</h3><h4>A / AN — неопределённый:</h4><ul>"
     "<li><b>a</b> + согласный звук: a book, a cat</li><li><b>an</b> + гласный звук: an apple, an hour</li></ul>"
     "<h4>THE — определённый:</h4><p>Известный или единственный объект: the sun, the Eiffel Tower</p>"
     "<p>I saw <b>a</b> film. <b>The</b> film was great.</p><h4>Без артикля:</h4><p>Имена, языки, спорт: Russia, English, football</p>",
     "I have a cat. The cat is black.\nShe is an engineer. An hour passed.", 9, 0),

    ("pronouns", "Личные и притяжательные местоимения",
     "<h3>Местоимения</h3><table style='width:100%;border-collapse:collapse;border:1px solid #e5e7eb'>"
     "<tr style='background:#f0fdf4'><th style='padding:8px;border:1px solid #e5e7eb'>Субъект</th><th style='padding:8px;border:1px solid #e5e7eb'>Объект</th><th style='padding:8px;border:1px solid #e5e7eb'>Притяж. прил.</th><th style='padding:8px;border:1px solid #e5e7eb'>Притяж. мест.</th></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>I</td><td style='padding:8px;border:1px solid #e5e7eb'>me</td><td style='padding:8px;border:1px solid #e5e7eb'>my</td><td style='padding:8px;border:1px solid #e5e7eb'>mine</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>he</td><td style='padding:8px;border:1px solid #e5e7eb'>him</td><td style='padding:8px;border:1px solid #e5e7eb'>his</td><td style='padding:8px;border:1px solid #e5e7eb'>his</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>she</td><td style='padding:8px;border:1px solid #e5e7eb'>her</td><td style='padding:8px;border:1px solid #e5e7eb'>her</td><td style='padding:8px;border:1px solid #e5e7eb'>hers</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>they</td><td style='padding:8px;border:1px solid #e5e7eb'>them</td><td style='padding:8px;border:1px solid #e5e7eb'>their</td><td style='padding:8px;border:1px solid #e5e7eb'>theirs</td></tr>"
     "</table>",
     "I see him. She loves her cat.\nThis is my book — it's mine.", 7, 0),

    ("verbs", "Модальные глаголы",
     "<h3>Модальные глаголы</h3><p>После модальных глаголов — инфинитив без <b>to</b>.</p>"
     "<table style='width:100%;border-collapse:collapse;border:1px solid #e5e7eb'>"
     "<tr style='background:#f0fdf4'><th style='padding:8px;border:1px solid #e5e7eb'>Глагол</th><th style='padding:8px;border:1px solid #e5e7eb'>Значение</th><th style='padding:8px;border:1px solid #e5e7eb'>Пример</th></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>can</td><td style='padding:8px;border:1px solid #e5e7eb'>умею/могу</td><td style='padding:8px;border:1px solid #e5e7eb'>I can swim.</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>must</td><td style='padding:8px;border:1px solid #e5e7eb'>должен</td><td style='padding:8px;border:1px solid #e5e7eb'>You must study.</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>should</td><td style='padding:8px;border:1px solid #e5e7eb'>следует</td><td style='padding:8px;border:1px solid #e5e7eb'>You should sleep.</td></tr>"
     "<tr><td style='padding:8px;border:1px solid #e5e7eb'>will</td><td style='padding:8px;border:1px solid #e5e7eb'>будущее</td><td style='padding:8px;border:1px solid #e5e7eb'>I will call you.</td></tr>"
     "</table>",
     "She can speak English.\nYou must do homework.\nI will help you.", 11, 0),
]

# ── ЗАДАНИЯ ─────────────────────────────────────────────────────
TASKS = [
    # Урок 2: Приветствия
    (2,"choice","Как сказать 'Привет' по-английски?","Hello",
     json.dumps(["Hello","Goodbye","Thank you","Sorry"]),5,0,"Hello — самое распространённое приветствие."),
    (2,"translate","Мен сизге жакшы күн каалайм (Я желаю вам хорошего дня)","I wish you a good day",
     None,5,1,"I wish you a good day — стандартная вежливая фраза."),
    (2,"fill","Good ___, my name is Aibek. (утреннее приветствие)","morning",
     None,5,2,"Good morning — доброе утро."),
    (2,"choice","Что означает 'Nice to meet you'?","Рад познакомиться",
     json.dumps(["Рад познакомиться","До свидания","Спасибо","Пожалуйста"]),5,3,"Nice to meet you — говорят при знакомстве."),
    (2,"translate","Кайда барасың? (Куда ты идёшь?)","Where are you going?",None,5,4,None),

    # Урок 3: Числа
    (3,"choice","Как будет число 7 по-английски?","seven",
     json.dumps(["five","six","seven","eight"]),5,0,"seven = 7"),
    (3,"fill","One, two, three, ___, five","four",None,5,1,"four = 4"),
    (3,"choice","Сколько это — fifteen?","15",
     json.dumps(["13","14","15","16"]),5,2,"fifteen = 15"),
    (3,"translate","Менде он эки алма бар (У меня двенадцать яблок)","I have twelve apples",None,5,3,None),

    # Урок 5: Present Simple
    (5,"fill","She ___ to school every day. (ходит)","goes",
     None,5,0,"He/She/It + goes. go → goes."),
    (5,"choice","Выберите правильное предложение:","He works in a bank.",
     json.dumps(["He work in a bank.","He working in a bank.","He works in a bank.","He is work in a bank."]),
     5,1,"В Present Simple для he/she/it добавляем -s."),
    (5,"fill","I ___ not like coffee. (вспомогательный глагол)","do",
     None,5,2,"Отрицание: I don't (do not)."),
    (5,"translate","Ал күн сайын китеп окуйт (Он читает книги каждый день)","He reads books every day",None,5,3,None),
    (5,"choice","Какой вопрос правильный?","Does she live in Bishkek?",
     json.dumps(["Do she live in Bishkek?","Is she live in Bishkek?","Does she live in Bishkek?","Does she lives in Bishkek?"]),
     5,4,"Does + subject + глагол (без -s)."),
    (5,"fill","They ___ football on weekends. (играют)","play",None,5,5,"They + глагол без -s."),

    # Урок 6: To Be
    (6,"choice","I ___ a student.","am",
     json.dumps(["am","is","are","be"]),5,0,"I + am."),
    (6,"fill","She ___ a doctor.","is",None,5,1,"She/He/It → is."),
    (6,"translate","Алар студенттер (Они студенты)","They are students",None,5,2,None),
    (6,"choice","Как спросить 'Вы устали?'","Are you tired?",
     json.dumps(["Is you tired?","Are you tired?","Am you tired?","Do you tired?"]),5,3,"you → are."),

    # Урок 7: Местоимения
    (7,"choice","___ is my book.","This",
     json.dumps(["This","These","Those","That"]),5,0,"This = этот (единственное, близко)."),
    (7,"fill","Give ___ the pen, please. (ему)","him",None,5,1,"him — объектная форма от he."),
    (7,"translate","Бул менин китебим (Это моя книга)","This is my book",None,5,2,None),
    (7,"choice","'их' (притяжательное) = ?","their",
     json.dumps(["them","they","their","theirs"]),5,3,"their — притяжательное: their house."),

    # Урок 8: Present Continuous
    (8,"fill","She ___ reading a book right now.","is",None,5,0,"she → is."),
    (8,"choice","Правильная форма run + -ing:","running",
     json.dumps(["runing","running","runnning","runeing"]),5,1,"run → running (удваиваем n)."),
    (8,"translate","Мен азыр английчени окуп жатам (Я сейчас учу английский)","I am studying English now",None,5,2,None),
    (8,"choice","Правильное предложение:","They are playing football.",
     json.dumps(["They playing football.","They are playing football.","They is playing football.","They are play football."]),
     5,3,"They → are + глагол-ing."),

    # Урок 9: Артикли
    (9,"choice","I saw ___ interesting film yesterday.","an",
     json.dumps(["a","an","the","-"]),5,0,"an — перед гласным звуком (interesting → 'i')."),
    (9,"fill","___ sun rises in the east.","The",None,5,1,"The — Солнце одно, известный объект."),
    (9,"translate","У меня есть кошка. Кошка белая.","I have a cat. The cat is white.",None,5,2,"Первый раз — a, второй — the."),
    (9,"choice","She is ___ engineer.","an",
     json.dumps(["a","an","the","-"]),5,3,"engineer начинается на гласный → an."),

    # Урок 10: Past Simple
    (10,"fill","I ___ to the cinema yesterday. (неправильный глагол go)","went",
     None,5,0,"go → went."),
    (10,"choice","Отрицание в Past Simple:","I didn't go.",
     json.dumps(["I not went.","I didn't go.","I wasn't go.","I don't went."]),5,1,"didn't + инфинитив."),
    (10,"translate","Кечээ ал мектепке барган (Вчера он пошёл в школу)","Yesterday he went to school",None,5,2,None),
    (10,"choice","She ___ English for 2 hours.","studied",
     json.dumps(["study","studyed","studied","studing"]),5,3,"study → studied (y → ied)."),

    # Урок 11: Модальные
    (11,"choice","You ___ eat more vegetables.","should",
     json.dumps(["should","shoulds","to should","shoulding"]),5,0,"should не изменяется."),
    (11,"fill","She ___ speak three languages. (умеет)","can",None,5,1,"can = умею/могу."),
    (11,"translate","Сен мектепке барышың керек (Тебе нужно идти в школу)","You must go to school",None,5,2,None),
    (11,"choice","'It might rain tomorrow' означает:","Возможно, завтра будет дождь",
     json.dumps(["Точно будет дождь","Возможно, завтра будет дождь","Дождя не будет","Дождь идёт сейчас"]),
     5,3,"might — слабая возможность."),

    # Урок 12: Future Simple
    (12,"fill","I ___ call you tomorrow.","will",None,5,0,"will + инфинитив = будущее."),
    (12,"choice","Правильное отрицание Future Simple:","She won't come.",
     json.dumps(["She will not coming.","She won't come.","She doesn't will come.","She will comes not."]),
     5,1,"won't = will not."),
    (12,"translate","Мен сени унутпайм (Я не забуду тебя)","I will not forget you",None,5,2,None),
]


async def seed():
    async with AsyncSession_() as db:
        result = await db.execute(select(Lesson))
        if result.scalars().first():
            print("Уроки уже есть в БД. Пропускаем.")
            print("Чтобы пересеять: TRUNCATE lessons, tasks, theory CASCADE;")
            return

        print("Заполняем БД...")
        for (id_, title, level, section, xp, desc, order) in LESSONS:
            db.add(Lesson(id=id_, title=title, level=level, section=section,
                          xp_reward=xp, description=desc, order_index=order, is_published=True))
        await db.flush()
        print(f"  {len(LESSONS)} уроков")

        for i, (cat, title, content, examples, lesson_id, order) in enumerate(THEORY, 1):
            db.add(Theory(id=i, category=cat, title=title, content=content, examples=examples,
                          lesson_id=lesson_id, order_index=order, is_published=True))
        await db.flush()
        print(f"  {len(THEORY)} теоретических блоков")

        for i, (lesson_id, task_type, prompt, answer, options, xp, order, expl) in enumerate(TASKS, 1):
            db.add(Task(id=i, lesson_id=lesson_id, task_type=task_type, prompt=prompt,
                        answer=answer, options=options, xp_reward=xp, order_index=order, explanation=expl))
        await db.flush()
        print(f"  {len(TASKS)} заданий")

        await db.commit()
        print("Готово!")


if __name__ == "__main__":
    asyncio.run(seed())