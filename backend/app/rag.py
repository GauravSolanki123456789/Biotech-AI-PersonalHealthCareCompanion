"""
RAG retrieval using LangChain + ChromaDB.
All indexed documents are derived strictly from PatientRecord.
Heavy ML imports are deferred until first index/query.
"""

from __future__ import annotations

import os
import re
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
_embeddings_lock = threading.Lock()
_vectorstore: Any = None
_records: list[PatientRecord] = []
_embeddings: Any = None


def get_embed_model_name() -> str:
    return _EMBED_MODEL


def openai_configured() -> bool:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return bool(key) and key.lower() not in _PLACEHOLDER_KEYS


def _get_embeddings() -> Any:
    """Lazy, process-wide HuggingFaceEmbeddings instance (avoids reload per upload)."""
    global _embeddings
    with _embeddings_lock:
        if _embeddings is None:
            from langchain_community.embeddings import HuggingFaceEmbeddings

            _embeddings = HuggingFaceEmbeddings(model_name=_EMBED_MODEL)
        return _embeddings


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
    from langchain_community.vectorstores import Chroma

    with _lock:
        _records = list(records)
        docs = [_patient_to_document(r) for r in _records]
        embeddings = _get_embeddings()
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


_CLINICAL_HINT = re.compile(
    r"\b("
    r"patient|patients|record|records|csv|upload|uploaded|clinical|cohort|"
    r"treatment|condition|conditions|diagnosis|diagnoses|disease|diseases|"
    r"symptom|symptoms|prognosis|medication|medications|therapy|therapies|"
    r"score|scores|age|ages|plan|plans|"
    r"summar(?:y|ise|ize)|average|mean|median|highest|lowest|max|min|"
    r"compare|list|how many|count|top\b|bottom\b|which\b|who\b"
    r")\b",
    re.I,
)

_UPLOAD_SCOPE = re.compile(
    r"\b("
    r"from (my|the) (upload|uploaded|file|csv|data|dataset|records)|"
    r"in (my|the) (upload|uploaded|file|csv|data|dataset|records)|"
    r"our (data|dataset|records|cohort)|"
    r"this (file|csv|dataset|dashboard)"
    r")\b",
    re.I,
)

_SMALLTALK_PATTERNS = (
    re.compile(r"\bhow\s*'?s\b.*\b(things|it going|life|your day)\b", re.I),
    re.compile(r"\bhow\s+are\s+you\b", re.I),
    re.compile(r"\bwhat\s*'?s\s+up\b(?!\s+with\s+patient)", re.I),
    re.compile(r"\bweather\b", re.I),
    re.compile(r"\b(joke|funny|laugh)\b", re.I),
    re.compile(r"^\s*(hi|hello|hey)\b[!.?\s]*$", re.I),
    re.compile(r"\b(thanks|thank you)\b", re.I),
)


def _query_targets_uploaded_records(
    query: str, *, instrument_mode: bool = False
) -> bool:
    """
    Heuristic: only run retrieval when the question is about the dataset.
    General knowledge / chit-chat should not dump CSV context.
    """
    q = (query or "").strip()
    if not q:
        return False
    if instrument_mode:
        return True
    for pat in _SMALLTALK_PATTERNS:
        if pat.search(q):
            return False
    if _UPLOAD_SCOPE.search(q):
        return True
    if _CLINICAL_HINT.search(q):
        return True
    return False


_NOT_IN_RECORDS = (
    "That question is not answered by your uploaded clinical records. "
    "Try asking about patients, conditions, treatment plans, ages, or "
    "clinical scores from the CSV you imported."
)

_NO_DATA_UPLOADED = (
    "No clinical records are loaded yet. Upload a CSV on the Upload Data page, "
    "then ask about the imported patients."
)


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

    not_found = (
        "I could not find that in the uploaded clinical records. "
        "Rephrase using patient_id, condition, treatment_plan, age, or clinical_score."
    )
    if not context.strip():
        return not_found

    if not openai_configured():
        if instrument_mode:
            return _offline_instrument_script(context)
        return (
            "Here is what the retrieval step surfaced from your uploaded records "
            "(concise summary — set OPENAI_API_KEY for richer answers):\n\n"
            + context
            + "\n\nSet OPENAI_API_KEY (not a placeholder) on the backend for "
            "full natural-language answers grounded in these rows."
        )

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.2,
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
            "You are a clinical decision support assistant for a lab dashboard. "
            "The user uploaded a CSV of patient rows. Answer ONLY using the "
            "patient records in the context. Each row has: patient_id, age, "
            "condition, clinical_score, treatment_plan.\n"
            "Rules:\n"
            "- Be direct and as short as possible while staying accurate.\n"
            "- If the answer needs multiple patients, use a compact bullet list.\n"
            "- If the context is insufficient, reply with exactly: "
            + not_found
            + "\n"
            "- Never invent patients, scores, or treatments not supported by the "
            "context.\n"
            "- Do not give medical advice beyond summarizing the uploaded data."
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


def _general_assistant_reply(query: str) -> str:
    """Short helpful reply when the question is not about the uploaded CSV."""
    if not openai_configured():
        return (
            _NOT_IN_RECORDS
            + " With OPENAI_API_KEY set, I can also answer general questions "
            "in this chat mode."
        )
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.4,
        api_key=os.getenv("OPENAI_API_KEY"),
    )
    sys_msg = (
        "You are a helpful assistant inside a clinical lab web app. The user may "
        "ask general questions (weather, small talk, coding, etc.). Answer "
        "accurately and concisely. If you lack live data (e.g. current weather "
        "at their location), say you do not have location-based live data and "
        "offer safe general guidance or ask what location they mean. "
        "Do not pretend to read their uploaded CSV unless they ask about it. "
        "Keep answers brief unless they ask for detail."
    )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", sys_msg),
            ("human", "{query}"),
        ]
    )
    chain: Any = prompt | llm
    out = chain.invoke({"query": query})
    return getattr(out, "content", str(out)).strip() or "Sorry — I could not generate a reply."


def answer_medical_query(query: str, *, instrument_mode: bool = False) -> str:
    """Retrieve chunks when relevant, then answer or emit instrument script."""
    stripped = (query or "").strip()
    if not stripped:
        return _NO_DATA_UPLOADED

    if not _query_targets_uploaded_records(stripped, instrument_mode=instrument_mode):
        return _general_assistant_reply(stripped)

    with _lock:
        has_index = _vectorstore is not None
    if not has_index:
        return _NO_DATA_UPLOADED

    context, docs = _retrieve_context(stripped, k=4)
    if not docs:
        return (
            "No matching rows were retrieved for that question. "
            "Try naming a patient_id, condition, or treatment keyword from your CSV."
        )
    return _llm_answer(stripped, context, instrument_mode=instrument_mode)
