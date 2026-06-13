from collections import defaultdict
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # room_id → list of (user_id, websocket)
        self.rooms: dict[str, list[tuple[int, WebSocket]]] = defaultdict(list)

    async def connect(self, room_id: str, user_id: int, ws: WebSocket):
        await ws.accept()
        self.rooms[room_id].append((user_id, ws))

    def disconnect(self, room_id: str, user_id: int):
        self.rooms[room_id] = [
            (uid, ws) for uid, ws in self.rooms[room_id] if uid != user_id
        ]

    async def broadcast(self, room_id: str, data: dict):
        """Отправить всем в комнате"""
        for _, ws in self.rooms[room_id]:
            await ws.send_json(data)

    async def send_to(self, room_id: str, user_id: int, data: dict):
        """Отправить конкретному игроку"""
        for uid, ws in self.rooms[room_id]:
            if uid == user_id:
                await ws.send_json(data)

manager = ConnectionManager()