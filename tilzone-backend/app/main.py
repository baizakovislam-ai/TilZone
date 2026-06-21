from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.config import settings
from app.database import engine
from app.models import *  # noqa: F403,F401

# Ensure static dir exists at startup
STATIC_DIR = Path("static/avatars")
STATIC_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded avatars as static files
app.mount("/static", StaticFiles(directory="static"), name="static")



app.include_router(api_router, prefix="/v1")


@app.get("/")
async def health():
    return {"status": "ok", "app": settings.app_name}


@app.get("/health")
async def healthcheck():
    return {"status": "ok"}