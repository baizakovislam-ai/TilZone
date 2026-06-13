from fastapi import APIRouter

from app.routers import ai, auth, leaderboard, lessons, pvp, theory, user

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(user.router, prefix="/user", tags=["user"])
api_router.include_router(lessons.router, prefix="/lessons", tags=["lessons"])
api_router.include_router(theory.router, prefix="/theory", tags=["theory"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(pvp.router, prefix="/pvp", tags=["pvp"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
from app.routers.pvp_ws import router as pvp_router
api_router.include_router(pvp_router)  # без prefix — WS на /pvp/ws