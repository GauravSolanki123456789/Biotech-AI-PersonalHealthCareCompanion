"""
RAG retrieval using LangChain + ChromaDB.
All indexed documents are derived strictly from PatientRecord.
Heavy ML imports are deferred until first index/query.
"""

from __future__ import annotations

import os
import threading
from typing import Any

from app.models import PatientRecord

_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
_PLACEHOLDER_KEYS = frozenset(
    {
        "",
        "your-openai-api-key-here",
        "placeholder",
        "sk-placeholder",
    }
)

_lock = threading.Lock()
_vectorstore: Any = None
_records: list[PatientRecord] = []


def _patient_to_document(record: PatientRecord) -> Any:
    from langchain_core.documents import Document

    page_content = (
        f"patient_id: {record.patient_id}\n"
        f"age: {record.age}\n"
        f"condition: {record.condition}\n"
        f"clinical_score: {record.clinical_score}\n"
        f"treatment_plan: {record.treatment_plan}"
    )
    return Document(
        page_content=page_content,
        metadata={"patient_id": record.patient_id},
    )


def rebuild_index(records: list[PatientRecord]) -> None:
    """Replace in-memory Chroma index with records (PatientRecord-only)."""
    global _vectorstore, _records
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_community.vectorstores import Chroma

    with _lock:
        _records = list(records)
        docs = [_patient_to_document(r) for r in _records]
        embeddings = HuggingFaceEmbeddings(model_name=_EMBED_MODEL)
        if docs:
            _vectorstore = Chroma.from_documents(
                documents=docs,
                embedding=embeddings,
                collection_name="patient_records",
            )
        else:
            _vectorstore = None


def get_record_count() -> int:
    with _lock:
        return len(_records)


def _retrieve_context(query: str, k: int = 4) -> tuple[str, list[Any]]:
    with _lock:
        vs = _vectorstore
    if vs is None:
        return "", []
    docs = vs.similarity_search(query, k=k)
    if not docs:
        return "", []
    parts = [d.page_content for d in docs]
    return "\n\n---\n\n".join(parts), docs


def _openai_configured() -> bool:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return bool(key) and key.lower() not in _PLACEHOLDER_KEYS


def _offline_instrument_script(context: str) -> str:
    """Emit offline instrument script when instrument_mode and no LLM key."""
    lines = [
        "# Biotech instrument integration (offline — set OPENAI_API_KEY for "
        "LLM-generated scripts)",
        "# Retrieved PatientRecord fields from uploaded clinical records:",
    ]
    for line in context.splitlines():
        lines.append(f"# {line}")
    lines.extend(
        [
            "",
            "def parse_ultrasound_metrics(serialized: bytes) -> dict:",
            (
                '    """Parse ultrasound metrics; extend with vendor-specific '
                'fields."""'
            ),
            "    return {",
            "        'patient_id': None,",
            "        'age': None,",
            "        'condition': None,",
            "        'clinical_score': None,",
            "        'treatment_plan': None,",
            "    }",
            "",
            "def map_instrument_row_to_patient_record(row: dict) -> dict:",
            (
                '    """Map instrument output to PatientRecord schema field '
                'names."""'
            ),
            "    return {",
            "        'patient_id': str(row['patient_id']),",
            "        'age': int(row['age']),",
            "        'condition': str(row['condition']),",
            "        'clinical_score': float(row['clinical_score']),",
            "        'treatment_plan': str(row['treatment_plan']),",
            "    }",
        ]
    )
    return "\n".join(lines)


def _llm_answer(
    query: str,
    context: str,
    *,
    instrument_mode: bool = False,
) -> str:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI

    not_found = "Data not found in the uploaded clinical records."
    if not context.strip():
        return not_found

    if not _openai_configured():
        if instrument_mode:
            return _offline_instrument_script(context)
        hint = (
            "Set OPENAI_API_KEY to a valid key (not a placeholder) for "
            "LLM-synthesized answers."
        )
        return (
            f"Based only on the uploaded clinical records:\n\n{context}\n\n{hint}"
        )

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0,
        api_key=os.getenv("OPENAI_API_KEY"),
    )
    if instrument_mode:
        sys_msg = (
            "You output ONLY a Python script snippet suitable for laboratory "
            "instrumentation (e.g. parsing ultrasound or biotech acquisition "
            "data). Use ONLY information grounded in the patient records in the "
            "context. Each record uses these field names: patient_id, age, "
            "condition, clinical_score, treatment_plan. Do not invent patients "
            "or values not implied by the context. Do not write conversational "
            "prose or explanations—only Python code. If the context cannot "
            "support any script, output exactly this single line and nothing "
            "else: Data not found in the uploaded clinical records."
        )
    else:
        sys_msg = (
            "You are a clinical decision support assistant. Answer using ONLY "
            "the patient records given in the context. Each record contains: "
            "patient_id, age, condition, clinical_score, treatment_plan. If "
            "the context does not contain information needed to answer the "
            "question, reply with exactly this sentence and nothing else: Data "
            "not found in the uploaded clinical records."
        )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", sys_msg),
            ("human", "Context:\n{context}\n\nQuestion: {query}"),
        ]
    )
    chain: Any = prompt | llm
    out = chain.invoke({"context": context, "query": query})
    text = getattr(out, "content", str(out)).strip()
    return text if text else not_found


def answer_medical_query(query: str, *, instrument_mode: bool = False) -> str:
    """Retrieve chunks, then conversational answer or instrument script."""
    context, docs = _retrieve_context(query, k=4)
    if not docs:
        return "Data not found in the uploaded clinical records."
    return _llm_answer(query, context, instrument_mode=instrument_mode)
