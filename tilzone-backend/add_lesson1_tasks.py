#!/usr/bin/env python3
"""
Добавляет задания в урок 1 (Алфавит).
Запуск: cd tilzone-backend && python add_lesson1_tasks.py
"""
import asyncio
import json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.config import settings
from app.models.learning import Task

engine = create_async_engine(settings.database_url, echo=False)
AsyncSession_ = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

LESSON1_TASKS = [
    ("choice",
     "Сколько букв в английском алфавите?",
     "26",
     json.dumps(["24", "25", "26", "28"]),
     5, 0,
     "В английском алфавите ровно 26 букв — от A до Z."),

    ("choice",
     "Какая буква идёт после D в английском алфавите?",
     "E",
     json.dumps(["F", "E", "G", "C"]),
     5, 1,
     "Порядок: A B C D E F G..."),

    ("choice",
     "Как произносится буква G?",
     "джи",
     json.dumps(["жи", "джи", "ги", "зи"]),
     5, 2,
     'G произносится как "джи".'),

    ("fill",
     "A, B, C, D, ___, F, G",
     "E",
     None,
     5, 3,
     "Пятая буква английского алфавита — E."),

    ("choice",
     "Какие буквы являются гласными в английском?",
     "A, E, I, O, U",
     json.dumps(["A, B, C, D, E", "A, E, I, O, U", "B, C, D, F, G", "A, I, U, Y, W"]),
     5, 4,
     "Гласные: A, E, I, O, U. Остальные — согласные."),

    ("choice",
     "Как называется буква W по-английски?",
     "double-u",
     json.dumps(["double-v", "double-u", "ви", "ду"]),
     5, 5,
     'W = "double-u" — единственная буква с двусложным названием.'),

    ("fill",
     "Буква ___ стоит последней в английском алфавите.",
     "Z",
     None,
     5, 6,
     "Алфавит заканчивается на Z (зи/зед)."),
]

async def main():
    async with AsyncSession_() as db:
        # Проверяем — может уже есть задания
        result = await db.execute(select(Task).where(Task.lesson_id == 1))
        existing = result.scalars().all()
        if existing:
            print(f"Урок 1 уже имеет {len(existing)} заданий. Пропускаем.")
            return

        for task_type, prompt, answer, options, xp, order, expl in LESSON1_TASKS:
            db.add(Task(
                lesson_id=1,
                task_type=task_type,
                prompt=prompt,
                answer=answer,
                options=options,
                xp_reward=xp,
                order_index=order,
                explanation=expl,
            ))

        await db.commit()
        print(f"✓ Добавлено {len(LESSON1_TASKS)} заданий в урок 1 (Алфавит)")

if __name__ == "__main__":
    asyncio.run(main())