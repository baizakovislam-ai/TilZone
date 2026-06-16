from fastapi import APIRouter

from app.routers.admin import dashboard, users, content

admin_router = APIRouter()

admin_router.include_router(dashboard.router, tags=["admin-dashboard"])
admin_router.include_router(users.router, prefix="/users", tags=["admin-users"])
admin_router.include_router(content.router, tags=["admin-content"])