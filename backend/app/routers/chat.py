from fastapi import APIRouter

from app.models import ChatResponse, MedicalQuery
from app.rag import answer_medical_query

router = APIRouter(tags=["chat"])


@router.post("/api/chat", response_model=ChatResponse)
def chat(body: MedicalQuery) -> ChatResponse:
    answer = answer_medical_query(body.query, instrument_mode=body.instrument_mode)
    return ChatResponse(answer=answer)
