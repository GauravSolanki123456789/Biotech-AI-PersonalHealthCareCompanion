import os

from fastapi import APIRouter

from app.rag import get_embed_model_name, get_record_count, openai_configured

router = APIRouter(tags=["stats"])


@router.get("/api/stats")
def stats() -> dict[str, str | int | bool]:
    return {
        "status": "ok",
        "records_indexed": get_record_count(),
        "embed_model": get_embed_model_name(),
        "openai_configured": openai_configured(),
    }
