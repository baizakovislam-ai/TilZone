import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.ws_manager import manager
from app.core.pvp_rooms import waiting_queue, create_room, get_room
from app.core.security import decode_token
from app.database import AsyncSessionLocal
from app.models.user import User

router = APIRouter()


async def get_user_from_token(token: str):
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
    except Exception:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            return None
        return user


@router.websocket("/pvp/ws")
async def pvp_websocket(ws: WebSocket, token: str):
    await ws.accept()

    user = await get_user_from_token(token)
    if not user:
        await ws.send_json({"type": "error", "message": "Unauthorized"})
        await ws.close(code=1008)
        return

    if waiting_queue:
        opponent_id = waiting_queue.pop(0)
        room = create_room(opponent_id, user.id)
        await manager.connect(room.room_id, int(user.id), ws)
        await manager.broadcast(room.room_id, {
            "type": "match_found",
            "room_id": room.room_id,
            "question": room.question["word"],
            "options": room.question["options"],
        })
    else:
        waiting_queue.append(user.id)
        await ws.send_json({"type": "waiting"})

    room_id = None

    try:
        async for msg in ws.iter_json():
            event = msg.get("type")

            if event == "join_room":
                room_id = msg["room_id"]
                await manager.connect(room_id, int(user.id), ws)

            elif event == "answer" and room_id:
                room = get_room(room_id)
                if not room or user.id in room.answered:
                    continue

                correct = msg["answer"] == room.question["correct"]
                elapsed = time.time() - room.started_at
                room.answered[user.id] = {"correct": correct, "time": elapsed}

                await ws.send_json({
                    "type": "answer_result",
                    "correct": correct,
                    "your_time": round(elapsed, 2),
                })

                if len(room.answered) == 2:
                    await _finish_round(room)

    except WebSocketDisconnect:
        if room_id:
            manager.disconnect(room_id, int(user.id))
        if user.id in waiting_queue:
            waiting_queue.remove(user.id)


async def _finish_round(room):
    a1 = room.answered.get(room.player1_id)
    a2 = room.answered.get(room.player2_id)

    def score(a): return (0 if a["correct"] else 1, a["time"])

    p1_wins = score(a1) < score(a2)
    winner_id = room.player1_id if p1_wins else room.player2_id
    loser_id  = room.player2_id if p1_wins else room.player1_id

    await manager.broadcast(room.room_id, {
        "type": "round_end",
        "winner_id": winner_id,
        "p1": {"user_id": room.player1_id, **a1},
        "p2": {"user_id": room.player2_id, **a2},
    })

    async with AsyncSessionLocal() as db:
        async with db.begin():
            for uid, won in [(winner_id, True), (loser_id, False)]:
                u = (await db.execute(select(User).where(User.id == uid))).scalar_one()
                if won:
                    u.elo += 25; u.xp += 40; u.pvp_wins += 1
                else:
                    u.elo = max(0, u.elo - 15); u.pvp_losses += 1