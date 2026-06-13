import time, random
from dataclasses import dataclass, field

QUESTIONS = [
    {"word": "Apple",  "correct": "Алма",    "options": ["Алма", "Алмурут", "Апельсин"]},
    {"word": "Water",  "correct": "Суу",     "options": ["Суу", "От", "Таш"]},
    {"word": "House",  "correct": "Үй",      "options": ["Үй", "Дарак", "Машина"]},
    {"word": "Friend", "correct": "Дос",     "options": ["Дос", "Душман", "Кошуна"]},
]

@dataclass
class PvPRoom:
    room_id: str
    player1_id: str
    player2_id: str
    question: dict
    started_at: float = field(default_factory=time.time)
    answered: dict = field(default_factory=dict)

waiting_queue: list[str] = []
rooms: dict[str, PvPRoom] = {}

def create_room(p1_id: str, p2_id: str) -> PvPRoom:
    room_id = f"room_{p1_id}_{p2_id}"
    q = random.choice(QUESTIONS)
    room = PvPRoom(room_id=room_id, player1_id=p1_id, player2_id=p2_id, question=q)
    rooms[room_id] = room
    return room

def get_room(room_id: str) -> PvPRoom | None:
    return rooms.get(room_id)