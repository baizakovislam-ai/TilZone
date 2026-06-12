from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    id: str
    name: str
    username: str
    avatar: str | None = None
    xp: int
    elo: int
    level: int
    league: str
    pvp_wins: int
    pvp_losses: int
    streak: int
    is_me: bool = False


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    my_rank: int | None = None   # позиция текущего юзера, если он вне топа