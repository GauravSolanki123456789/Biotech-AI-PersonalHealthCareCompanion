import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import chat, health, upload

load_dotenv()
_log = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("WARM_EMBEDDINGS", "true").lower() in (
        "1",
        "true",
        "yes",
    ):
        try:
            from app.rag import preload_embedding_model

            preload_embedding_model()
            _log.info("Embedding model loaded (WARM_EMBEDDINGS).")
        except Exception as exc:  # pragma: no cover - env / cache issues
            _log.warning(
                "Embedding preload skipped (uploads will load on demand): %s",
                exc,
            )
    yield


app = FastAPI(
    title="Biotech-AI-PersonalHealthCareCompanion API",
    version="1.0.0",
    lifespan=lifespan,
)

_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
_origins_env = os.getenv("CORS_ORIGINS", _default_origins)
_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(upload.router)
app.include_router(chat.router)
