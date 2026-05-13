"""
RAG retrieval using LangChain + ChromaDB.
All indexed documents are derived strictly from PatientRecord.
Heavy ML imports are deferred until first preload / index build.
The sentence-transformers model is cached and reused across uploads so CSV
re-indexing only embeds new rows, not reload weights.

Offline-first: unrelated questions receive a fixed message.

For uploads, count/list/filter questions are answered by scanning **condition**
and **treatment_plan** with synonym groups and light fuzzy typo handling;
embeddings are only a fallback and are rejected unless rows pass the text
gate. Optional OpenAI can polish wording when a key is configured.
"""

from __future__ import annotations

import os
import re
import threading
from difflib import SequenceMatcher
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
_embed_lock = threading.Lock()
_vectorstore: Any = None
_records: list[PatientRecord] = []
_embeddings_singleton: Any = None

# Splits factual spreadsheet text from trailing Python when instrument_mode.
_INSTRUMENT_REPLY_DELIMITER = "<<<INSTRUMENT_BLOCK>>>"

_MSG_NO_UPLOAD = (
    "No patient data is loaded. Upload a CSV first, then ask questions about "
    "those records."
)
_MSG_NOT_RELATED_TO_DATA = (
    "The question is not related to the uploaded patient data. "
    "Ask about patients, conditions, clinical scores, treatment plans, or "
    "other information from your imported spreadsheet."
)

_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "if",
        "when",
        "what",
        "which",
        "who",
        "this",
        "that",
        "these",
        "those",
        "am",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "to",
        "of",
        "in",
        "on",
        "for",
        "with",
        "about",
        "from",
        "all",
        "any",
        "each",
        "some",
        "more",
        "most",
        "other",
        "only",
        "same",
        "so",
        "than",
        "too",
        "very",
        "can",
        "will",
        "just",
        "give",
        "want",
        "know",
        "please",
        "hello",
        "hey",
        "hi",
        "how",
        "why",
        "tell",
        "tell me",
        "me",
        "my",
        "we",
        "our",
        "you",
        "your",
    }
)

_GENERAL_OFF_TOPIC_SNIPPETS = (
    "weather",
    "forecast",
    "raining",
    "snow ",
    "humidity",
    "uv index",
    "temperature outside",
    "tell me a joke",
    "joke:",
    "write a poem",
    "capital of ",
    "who won the",
    "super bowl",
    "stock price",
    "bitcoin",
    "ethereum",
    "recipe for",
    "movie recommendation",
    "what time is it",
    "what's the time",
    "hello",
    "hey there",
    "hi there",
    "how are you",
    "thank you",
    "thanks",
)

_UPLOAD_AND_TABLE_SNIPPETS = (
    "upload",
    "csv",
    "spreadsheet",
    "excel",
    "import",
    "indexed",
    "dataset",
    "these records",
    "this data",
    "our data",
    "patient_id",
    "clinical_score",
    "treatment plan",
    "treatment_plan",
    "clinical score",
    "patients",
    "patient record",
    "patient records",
)

# Words stripped when turning a question into match "concepts"
# (counts / lists must not rely on embeddings alone).
_FLUFF_MATCH_TOKENS = frozenset(
    {
        "patients",
        "patient",
        "people",
        "many",
        "much",
        "some",
        "each",
        "every",
        "related",
        "diseases",
        "disease",
        "conditions",
        "condition",
        "records",
        "record",
        "rows",
        "row",
        "sheet",
        "table",
        "data",
        "upload",
        "uploaded",
        "csv",
        "file",
        "imported",
        "indexed",
        "spreadsheet",
        "tell",
        "give",
        "show",
        "list",
        "what",
        "which",
        "who",
        "how",
        "are",
        "all",
        "any",
        "does",
        "have",
        "has",
        "having",
        "with",
        "about",
        "from",
        "the",
        "there",
        "their",
        "those",
        "these",
        "please",
        "just",
        "only",
        "also",
        "that",
        "this",
        "such",
        "kind",
        "types",
        "type",
        "number",
        "total",
        "count",
        "names",
        "name",
        "ids",
        "id",
        "anything",
        "everything",
        "something",
        "stuff",
        "information",
        "details",
        "detail",
        "summary",
        "overview",
        "describe",
        "description",
        "questions",
        "question",
        "answers",
        "answer",
        "me",
        "us",
        "we",
        "you",
        "your",
        "my",
        "our",
        "well",
        "like",
        "want",
        "need",
        "know",
        "get",
        "got",
        "find",
        "look",
        "looking",
        "search",
        "searched",
    }
)


# Canonical heads + synonym sets (OR within a group); AND across distinct
# tokens in the user's question.
_CONCEPT_GROUPS: tuple[tuple[str, frozenset[str]], ...] = (
    (
        "stomach",
        frozenset(
            {
                "stomach",
                "abdominal",
                "abdomen",
                "belly",
                "gastric",
                "gastro",
                "gastrointestinal",
                "intestinal",
                "intestines",
                "bowel",
                "colon",
                "colonic",
                "digestive",
                "digestion",
                "ibs",
                "ibd",
                "crohn",
                "colitis",
                "peptic",
                "reflux",
                "gerd",
                "dyspepsia",
                "barrett",
                "nausea",
                "vomiting",
                "emesis",
            }
        ),
    ),
    (
        "liver",
        frozenset(
            {
                "liver",
                "hepatic",
                "hepatitis",
                "cirrhosis",
                "fibrosis",
                "steatosis",
                "bilirubin",
                "jaundice",
            }
        ),
    ),
    (
        "kidney",
        frozenset(
            {
                "kidney",
                "kidneys",
                "renal",
                "ckd",
                "esrd",
                "dialysis",
                "glomerul",
                "nephritis",
                "creatinine",
                "proteinuria",
            }
        ),
    ),
    (
        "urogenital",
        frozenset(
            {
                "urinary",
                "urine",
                "bladder",
                "ureter",
                "uti",
                "incontinence",
                "dysuria",
            }
        ),
    ),
    (
        "hypertension",
        frozenset(
            {"hypertension", "hypertensive", "htn", "bloodpressure"}
        ),
    ),
    (
        "cardiovascular",
        frozenset(
            {
                "cardiovascular",
                "cardiology",
                "cardiac",
                "heart",
                "coronary",
                "cad",
                "chd",
                "ischemia",
                "ischemic",
                "angina",
                "myocardial",
                "stemi",
                "nstemi",
                "heartattack",
                "arrhythm",
                "fibrillation",
                "flutter",
                "tachycardia",
                "bradycardia",
                "cardiomyopathy",
                "heartfailure",
                "chf",
                "decompensated",
                "pericard",
                "endocard",
                "valve",
                "pacemaker",
            }
        ),
    ),
    (
        "stroke",
        frozenset({"stroke", "cva", "tia", "cerebrovascular", "thrombus"}),
    ),
    (
        "pulmonary",
        frozenset(
            {
                "pulmonary",
                "lung",
                "lungs",
                "respiratory",
                "airway",
                "copd",
                "asthma",
                "emphysema",
                "bronchitis",
                "bronchiectasis",
                "pneumonia",
                "pneumonitis",
                "pleurisy",
                "effusion",
                "hypoxemia",
                "oxygen",
                "ventilator",
                "tuberculosis",
            }
        ),
    ),
    (
        "thyroid",
        frozenset(
            {
                "thyroid",
                "hypothyroid",
                "hyperthyroid",
                "hashimoto",
                "grave",
                "graves",
                "goiter",
                "goitre",
                "thyrotoxic",
                "thyroiditis",
            }
        ),
    ),
    (
        "diabetes",
        frozenset(
            {
                "diabetes",
                "diabetic",
                "glycemic",
                "hyperglycemic",
                "hypoglycemic",
                "insulin",
                "hba1c",
                "hba1",
                "a1c",
                "glucose",
                "ketosis",
                "ketoacidosis",
            }
        ),
    ),
    (
        "gestational",
        frozenset(
            {
                "gestational",
                "pregnancy",
                "pregnant",
                "prenatal",
                "antenatal",
                "postpartum",
                "partum",
                "trimester",
            }
        ),
    ),
    (
        "fever",
        frozenset({"fever", "febrile", "pyrexia"}),
    ),
    (
        "pain",
        frozenset(
            {
                "pain",
                "ache",
                "aching",
                "nociceptive",
                "fibromyalgia",
                "migraine",
                "headache",
                "cranial",
            }
        ),
    ),
    (
        "infection",
        frozenset(
            {
                "infection",
                "infected",
                "infectious",
                "sepsis",
                "septic",
                "bacteremia",
                "bacterial",
                "viral",
                "fungal",
                "neutropenia",
                "culture",
                "antibiotic",
                "antibiotics",
                "antimicrobial",
                "antigen",
            }
        ),
    ),
    (
        "hematology",
        frozenset(
            {
                "anemia",
                "anaemia",
                "hemoglobin",
                "haemoglobin",
                "hematology",
                "platelet",
                "thrombocyt",
                "leukocyt",
                "polycythemia",
                "transfusion",
                "bleeding",
                "coagula",
                "anticoagul",
                "warfarin",
                "dabigatran",
                "thrombos",
                "embol",
                "embolism",
                "dvt",
                "inr",
                "hemophilia",
            }
        ),
    ),
    (
        "oncology",
        frozenset(
            {
                "oncology",
                "oncologist",
                "cancer",
                "malign",
                "tumor",
                "tumour",
                "neoplasm",
                "carcinoma",
                "sarcoma",
                "lymphoma",
                "leukemia",
                "leukaemia",
                "metasta",
                "chemotherapy",
                "chemo",
                "radiotherapy",
                "radiation",
                "immunotherapy",
                "staging",
                "benign",
            }
        ),
    ),
    (
        "mental",
        frozenset(
            {
                "depression",
                "depressive",
                "anxiety",
                "panic",
                "bipolar",
                "psychosis",
                "schizophrenia",
                "ptsd",
                "trauma",
                "insomnia",
                "adhd",
                "ocd",
                "mental",
                "psychiatr",
            }
        ),
    ),
    (
        "msk",
        frozenset(
            {
                "arthritis",
                "arthritic",
                "osteoarthritis",
                "rheumat",
                "lupus",
                "sjogren",
                "joint",
                "muscle",
                "myalgia",
                "tendinitis",
                "bursitis",
                "spine",
                "lumbar",
                "cervical",
                "spondyl",
                "fracture",
                "osteoporosis",
                "osteopenia",
                "bone",
            }
        ),
    ),
    (
        "dermatology",
        frozenset(
            {
                "skin",
                "dermatitis",
                "eczema",
                "psoriasis",
                "rash",
                "urticaria",
                "melanoma",
                "papule",
                "lesion",
            }
        ),
    ),
    (
        "metformin",
        frozenset({"metformin", "biguanide"}),
    ),
    (
        "statins",
        frozenset(
            {"statin", "statins", "atorvastatin", "simvastatin", "rosuvastatin"}
        ),
    ),
    (
        "beta_blocker",
        frozenset(
            {
                "beta-blocker",
                "betablocker",
                "metoprolol",
                "atenolol",
                "bisoprolol",
                "propranolol",
            }
        ),
    ),
    (
        "ace_inhibitor",
        frozenset(
            {"ace", "acei", "angiotensin", "lisinopril", "enalapril", "ramipril"}
        ),
    ),
    (
        "nsaid",
        frozenset({"nsaid", "nsaids", "ibuprofen", "naproxen", "diclofenac"}),
    ),
    (
        "opioid",
        frozenset(
            {
                "opioid",
                "opiates",
                "morphine",
                "oxycodone",
                "fentanyl",
                "hydrocodone",
                "tramadol",
                "analges",
            }
        ),
    ),
    (
        "karyotyping",
        frozenset({"karyotyping", "kariotyping", "karietyping", "cariotyping"}),
    ),
    (
        "genetic",
        frozenset(
            {
                "genetic",
                "genomics",
                "chromosome",
                "sequencing",
                "carrier",
                "mutation",
                "variant",
                "allele",
                "hereditary",
            }
        ),
    ),
    (
        "pcos",
        frozenset({"pcos", "polycystic"}),
    ),
    (
        "fibroid",
        frozenset(
            {
                "fibroid",
                "fibroids",
                "leiomyoma",
                "myoma",
                "uterinefibroid",
            }
        ),
    ),
    (
        "adenomyosis",
        frozenset({"adenomyosis", "adenomyotic"}),
    ),
    (
        "endometriosis",
        frozenset({"endometriosis"}),
    ),
    (
        "endometrial",
        frozenset({"endometrial", "endometrium"}),
    ),
    (
        "ovar",
        frozenset({"ovarian", "ovary", "ovaries", "ovar"}),
    ),
    (
        "cyst",
        frozenset({"cyst", "cystic"}),
    ),
    (
        "uterus",
        frozenset(
            {"uterine", "uterus", "womb", "hysterectomy", "myomectomy"}
        ),
    ),
    (
        "gynecologic",
        frozenset(
            {
                "gynec",
                "gynaec",
                "gynecologic",
                "gynecology",
                "obgyn",
                "pelvicexam",
                "speculum",
                "smear",
            }
        ),
    ),
    (
        "menopause",
        frozenset(
            {
                "menopause",
                "menopausal",
                "postmenopausal",
                "postmenopause",
                "perimenopause",
            }
        ),
    ),
    (
        "dysmenorrhea",
        frozenset(
            {
                "dysmenorrhea",
                "dysmenorrhoea",
                "period",
                "menses",
                "menstrual",
                "menorrhag",
            }
        ),
    ),
    (
        "miscarriage",
        frozenset(
            {"miscarriage", "abortion", "pregnancyloss", "pregnancy-loss"}
        ),
    ),
    (
        "imaging",
        frozenset(
            {
                "ultrasound",
                "sonogra",
                "sonogram",
                "radiograph",
                "xray",
                "x-ray",
                "tomography",
                "mri",
                "ctscan",
                "echo",
                "echocardio",
            }
        ),
    ),
    (
        "intravenous",
        frozenset(
            {
                "intravenous",
                "infusion",
            }
        ),
    ),
    (
        "surgery",
        frozenset(
            {
                "surgery",
                "surgical",
                "operative",
                "laparoscop",
                "laparotom",
                "excision",
                "resection",
                "prosthesis",
                "implant",
            }
        ),
    ),
    (
        "nutrition",
        frozenset(
            {
                "diet",
                "dietary",
                "obesity",
                "overweight",
                "nutrition",
                "calorie",
            }
        ),
    ),
    (
        "oncology_procedure",
        frozenset(
            {
                "biopsy",
                "histology",
                "staging",
                "lymphadenectomy",
                "mastectomy",
            }
        ),
    ),
    (
        "fertility",
        frozenset(
            {
                "fertility",
                "infertility",
                "subfertility",
                "conception",
                "ivf",
            }
        ),
    ),
)


# Normalize short clinical abbreviations to a concept head in _CONCEPT_GROUPS.
_MED_ABBREV_EXTRA: dict[str, str] = {
    "htn": "hypertension",
    "dm": "diabetes",
    "cad": "cardiovascular",
    "chf": "cardiovascular",
    "copd": "pulmonary",
    "uti": "urogenital",
    "cva": "stroke",
    "tia": "stroke",
    "dvt": "hematology",
    "acs": "cardiovascular",
    "mi": "cardiovascular",
    "ckd": "kidney",
    "esrd": "kidney",
    "hba1c": "diabetes",
    "gdm": "gestational",
    "ivf": "fertility",
    "iv": "intravenous",
}

# Tokens with len ≤3 processed only if abbreviation or PID acronym.
_ALLOWED_SHORT_MEDICAL: frozenset[str] = frozenset({"pid"} | set(_MED_ABBREV_EXTRA.keys()))


_DATA_QUESTION_SNIPPETS = (
    "how many",
    "how old",
    "oldest",
    "youngest",
    "average ",
    "mean ",
    "median ",
    "list ",
    "show ",
    "count ",
    "count?",
    "records",
    "record ",
    "row ",
    "rows ",
    "each ",
    "every ",
    "compare",
    "difference between",
    "highest",
    "lowest",
    "max ",
    "min ",
    "greater than",
    "less than",
    " age",
    " scores",
    " score?",
)

# Count / list / filter style questions (should not use raw embedding top-k).
_STRUCTURED_LIST_OR_COUNT_SNIPPETS = (
    "how many",
    "how much",
    "count ",
    "count?",
    "number of",
    "list ",
    "list all",
    "show all",
    "show ",
    "which patient",
    "which patients",
    "what patient",
    "what patients",
    "who has",
    "who have",
    "patients who",
    "patients with",
    "patients have",
    "patients having",
    "what are all",
    "tell me all",
    "give me all",
    "every patient",
    "each patient",
    "all patient",
)


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


def preload_embedding_model() -> None:
    """Load HuggingFace embeddings once (startup). Uploads stay fast afterwards."""
    _get_embeddings_singleton()


def _get_embeddings_singleton() -> Any:
    """Reuse one SentenceTransformer-backed embedder across Chroma rebuilds."""
    global _embeddings_singleton
    if _embeddings_singleton is not None:
        return _embeddings_singleton
    with _embed_lock:
        if _embeddings_singleton is not None:
            return _embeddings_singleton
        from langchain_community.embeddings import HuggingFaceEmbeddings

        model_name = os.getenv("HF_EMBEDDING_MODEL", _EMBED_MODEL).strip()
        _embeddings_singleton = HuggingFaceEmbeddings(
            model_name=model_name,
            encode_kwargs={
                "batch_size": 256,
                "normalize_embeddings": True,
            },
        )
    return _embeddings_singleton


def rebuild_index(records: list[PatientRecord]) -> None:
    """Replace in-memory Chroma index with records (PatientRecord-only)."""
    global _vectorstore, _records
    from langchain_community.vectorstores import Chroma

    snapshot = list(records)
    embeddings = _get_embeddings_singleton()
    docs = [_patient_to_document(r) for r in snapshot]

    if docs:
        vs = Chroma.from_documents(
            documents=docs,
            embedding=embeddings,
            collection_name="patient_records",
        )
    else:
        vs = None

    with _lock:
        _records = snapshot
        _vectorstore = vs


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


def _significant_tokens(question: str) -> list[str]:
    return [
        t
        for t in re.findall(r"[a-z0-9]+", question.lower())
        if t not in _STOPWORDS
    ]


def _record_search_blob(record: PatientRecord) -> str:
    sc = record.clinical_score
    score_txt = str(int(sc)) if sc == int(sc) else str(sc)
    return (
        f"{record.patient_id} "
        f"{record.age} "
        f"{score_txt} "
        f"{record.condition} "
        f"{record.treatment_plan}"
    ).lower()


def _needs_structured_list_or_count(query: str) -> bool:
    ql = query.lower().strip()
    if re.search(r"\bcount\b", ql):
        return True
    return any(snippet in ql for snippet in _STRUCTURED_LIST_OR_COUNT_SNIPPETS)


def _asking_total_catalog_no_filter(query: str) -> bool:
    """True when user wants counts/list of everyone and gave no illness filter."""
    ql = query.lower().strip()
    if not ql:
        return False

    mentions_rows = (
        "patient" in ql
        or "patient_id" in ql
        or "records" in ql
        or "record" in ql
        or "rows" in ql
        or "row" in ql
        or "dataset" in ql
        or "data" in ql
        or "upload" in ql
        or "file" in ql
    )

    qty = (
        "how many" in ql
        or "total" in ql
        or "number of" in ql
        or "count all" in ql
        or ql.startswith("count")
    )
    catalog = (
        "list all" in ql
        or "show all" in ql
        or "every patient" in ql
        or "each patient" in ql
        or "all patients" in ql
        or ql.strip() == "list"
        or ql.strip().startswith("list ")
    )

    return mentions_rows and (qty or catalog)


def _fuzz_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _term_matches_blob(term: str, blob: str) -> bool:
    tl = term.lower()
    bl = blob.lower()
    if not tl:
        return False
    if tl in bl:
        return True
    for w in re.findall(r"[a-z0-9]+", bl):
        if abs(len(w) - len(tl)) > max(4, len(tl) // 2):
            continue
        if _fuzz_ratio(tl, w) >= 0.82:
            return True
    return False


def _group_matches_blob(group: frozenset[str], blob: str) -> bool:
    return any(_term_matches_blob(t, blob) for t in group)


def _closure_for_head_string(head: str) -> frozenset[str] | None:
    for h, syns in _CONCEPT_GROUPS:
        if h == head:
            return frozenset(syns) | frozenset({h})
    return None


def _closure_for_word(w: str) -> frozenset[str]:
    lw = w.lower()
    if lw == "pid":
        return frozenset({"pid"})
    if lw in _MED_ABBREV_EXTRA:
        mapped = _MED_ABBREV_EXTRA[lw]
        g = _closure_for_head_string(mapped)
        if g is not None:
            return g
        return frozenset({lw})
    for _head, syns in _CONCEPT_GROUPS:
        if lw == _head or lw in syns:
            return frozenset(syns) | frozenset({_head})
    return frozenset({lw})


def _match_groups_from_question(query: str) -> list[frozenset[str]]:
    raw = re.findall(r"[a-z0-9]+", query.lower())
    groups: list[frozenset[str]] = []
    for w in raw:
        if w in _FLUFF_MATCH_TOKENS:
            continue
        if len(w) <= 3 and w not in _ALLOWED_SHORT_MEDICAL:
            continue
        g = _closure_for_word(w)
        if g not in groups:
            groups.append(g)
    return groups


def _record_matches_groups(record: PatientRecord, groups: list[frozenset[str]]) -> bool:
    blob = _record_search_blob(record)
    return all(_group_matches_blob(g, blob) for g in groups)


def _record_soft_overlap(record: PatientRecord, query: str) -> bool:
    blob = _record_search_blob(record)
    for w in re.findall(r"[a-z0-9]+", query.lower()):
        if w in _FLUFF_MATCH_TOKENS or len(w) < 5:
            continue
        if _term_matches_blob(w, blob):
            return True
    return False


def _record_sort_key(record: PatientRecord) -> str:
    return str(record.patient_id).lower()


def _format_record_block(record: PatientRecord) -> str:
    return (
        f"patient_id: {record.patient_id}\n"
        f"age: {record.age}\n"
        f"condition: {record.condition}\n"
        f"clinical_score: {record.clinical_score}\n"
        f"treatment_plan: {record.treatment_plan}"
    )


def _format_truth_table_answer(query: str, rows: list[PatientRecord]) -> str:
    ql = query.lower()
    rows_sorted = sorted(rows, key=_record_sort_key)
    n = len(rows_sorted)
    qty_asked = (
        "how many" in ql
        or "number of" in ql
        or "count" in ql
        or _needs_structured_list_or_count(query)
    )
    head = (
        f"**{n} row(s)** in your uploaded data match this question "
        "(plain-text match on **condition** and **treatment_plan**, with "
        "light typo tolerance)."
    )
    if not qty_asked:
        head = (
            f"**{n} row(s)** match (condition + treatment_plan text; "
            "light typo tolerance)."
        )

    if n == 0:
        return (
            f"{head}\n\n"
            "No patient rows mention the requested ideas in condition or "
            "treatment_plan fields."
        )

    body = "\n\n---\n\n".join(_format_record_block(r) for r in rows_sorted)
    return f"{head}\n\n{body}"


def _semantic_rows_validated(
    query: str, documents: list[Any], records: list[PatientRecord]
) -> list[PatientRecord]:
    out: list[PatientRecord] = []
    seen: set[str] = set()
    for doc in documents:
        pid = str(doc.metadata.get("patient_id", "")).strip()
        if not pid:
            continue
        pid_cmp = pid.lower()
        for r in records:
            rid = str(r.patient_id).strip().lower()
            if rid != pid_cmp:
                continue
            rec_key = str(r.patient_id).strip()
            if rec_key in seen:
                break
            groups = _match_groups_from_question(query)
            if groups:
                ok = _record_matches_groups(r, groups)
            else:
                ok = _record_soft_overlap(r, query)
            if ok:
                out.append(r)
                seen.add(rec_key)
            break
    return out


def _context_from_records(rows: list[PatientRecord]) -> str:
    return "\n\n---\n\n".join(_format_record_block(r) for r in rows)


def _question_refers_to_uploaded_patients(query: str) -> bool:
    """True when the user is asking about content of the imported sheet."""
    q = query.strip()
    if not q:
        return False

    ql = q.lower()

    with _lock:
        recs = list(_records)

    if not recs:
        return False

    off_topic = any(s in ql for s in _GENERAL_OFF_TOPIC_SNIPPETS)
    table_signal = any(s in ql for s in _UPLOAD_AND_TABLE_SNIPPETS)
    if off_topic and not table_signal:
        return False

    if any(s in ql for s in _DATA_QUESTION_SNIPPETS):
        return True
    if table_signal:
        return True

    blobs = [_record_search_blob(r) for r in recs]
    tokens = _significant_tokens(q)
    if not tokens:
        return False

    for tok in tokens:
        if len(tok) >= 4:
            if any(tok in blob for blob in blobs):
                return True
            continue

        if len(tok) >= 3 and any(tok in blob.split() for blob in blobs):
            return True

    compact = re.sub(r"\s+", "", ql)
    for r in recs:
        pid = str(r.patient_id).strip().lower().replace(" ", "")
        if len(pid) >= 3 and pid in compact.replace(" ", ""):
            return True

    return False


def _offline_instrument_script(context: str) -> str:
    """Emit an offline-safe instrument template seeded from retrieved rows."""
    lines = [
        "# Biotech instrument integration (offline starter template)",
        "# Retrieved PatientRecord fields from uploaded clinical rows:",
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
    """Synthesize from retrieved context using OpenAI (caller checks the key)."""
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI

    not_found = "Data not found in the uploaded clinical records."
    if not context.strip():
        return not_found

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0,
        api_key=os.getenv("OPENAI_API_KEY"),
    )
    if instrument_mode:
        sys_msg = (
            "You output ONLY a Python script snippet suitable for laboratory "
            "instrumentation (e.g. parsing ultrasound or biotech acquisition "
            "data). Use ONLY information grounded in the patient records in "
            "the context. Each record uses these field names: patient_id, age, "
            "condition, clinical_score, treatment_plan. Do not invent patients "
            "or values not implied by the context. Do not write "
            "conversational prose or explanations—only Python code. If the "
            "context cannot support any script, output exactly this single "
            "line and nothing else: Data not found in the uploaded clinical "
            "records."
        )
    else:
        sys_msg = (
            "You are a clinical decision support assistant. Answer using ONLY "
            "the patient records given in the context. Each record contains: "
            "patient_id, age, condition, clinical_score, treatment_plan. If "
            "the context does not contain information needed to answer the "
            "question, reply with exactly this sentence and nothing else: "
            "Data not found in the uploaded clinical records."
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
    """Filter rows by literal condition/treatment text; embeddings are secondary."""
    with _lock:
        no_store = _vectorstore is None or not _records
        recs = list(_records)

    q = query.strip()

    if no_store:
        return _MSG_NO_UPLOAD

    if not _question_refers_to_uploaded_patients(q):
        return _MSG_NOT_RELATED_TO_DATA

    groups = _match_groups_from_question(q)
    structured = _needs_structured_list_or_count(q)

    rows: list[PatientRecord] = []

    if structured:
        if not groups:
            if _asking_total_catalog_no_filter(q):
                rows = list(recs)
            else:
                return (
                    "Add a filter (for example a condition, treatment phrase, or "
                    "patient_id) so I can match specific rows."
                )
        else:
            rows = [r for r in recs if _record_matches_groups(r, groups)]
    else:
        if groups:
            rows = [r for r in recs if _record_matches_groups(r, groups)]

        if not rows:
            _, docs = _retrieve_context(q, k=12)
            if docs:
                rows = _semantic_rows_validated(q, docs, recs)

        if not rows:
            return (
                "No rows in your uploaded data clearly match this question "
                "(checked condition + treatment text; nearest embedding hits "
                "alone are not shown)."
            )

    facts = _format_truth_table_answer(q, rows)

    if _openai_configured():
        ctx = _context_from_records(rows)
        llm_text = _llm_answer(q, ctx, instrument_mode=instrument_mode)
        if instrument_mode:
            return (
                f"{facts.rstrip()}\n\n{_INSTRUMENT_REPLY_DELIMITER}\n\n"
                f"{llm_text.strip()}"
            )
        return llm_text

    if instrument_mode:
        appendix = _offline_instrument_script(_context_from_records(rows)).strip()
        return (
            f"{facts.rstrip()}\n\n{_INSTRUMENT_REPLY_DELIMITER}\n\n{appendix}"
        )

    return facts
