import type { PatientRecord } from "@/lib/types";

const CLINICAL_HINT =
  /\b(patient|patients|record|records|csv|upload|uploaded|clinical|cohort|treatment|condition|conditions|diagnosis|diagnoses|disease|diseases|symptom|symptoms|prognosis|medication|medications|therapy|therapies|score|scores|age|ages|plan|plans|summar(?:y|ise|ize)|average|mean|median|highest|lowest|max|min|compare|list|how many|count|top\b|bottom\b|which\b|who\b)\b/i;

const UPLOAD_SCOPE =
  /\b(from (my|the) (upload|uploaded|file|csv|data|dataset|records)|in (my|the) (upload|uploaded|file|csv|data|dataset|records)|our (data|dataset|records|cohort)|this (file|csv|dataset|dashboard))\b/i;

const SMALLTALK: RegExp[] = [
  /\bhow\s*'?s\b.*\b(things|it going|life|your day)\b/i,
  /\bhow\s+are\s+you\b/i,
  /\bwhat\s*'?s\s+up\b(?!\s+with\s+patient)/i,
  /\bweather\b/i,
  /\b(joke|funny|laugh)\b/i,
  /^\s*(hi|hello|hey)\b[!.?\s]*$/i,
  /\b(thanks|thank you)\b/i,
];

function queryTargetsRecords(query: string, instrumentMode: boolean): boolean {
  const q = (query || "").trim();
  if (!q) return false;
  if (instrumentMode) return true;
  for (const pat of SMALLTALK) {
    if (pat.test(q)) return false;
  }
  if (UPLOAD_SCOPE.test(q)) return true;
  if (CLINICAL_HINT.test(q)) return true;
  return false;
}

function recordToDoc(r: PatientRecord): string {
  return (
    `patient_id: ${r.patient_id}\n` +
    `age: ${r.age}\n` +
    `condition: ${r.condition}\n` +
    `clinical_score: ${r.clinical_score}\n` +
    `treatment_plan: ${r.treatment_plan}`
  );
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9._\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreRecord(query: string, r: PatientRecord): number {
  const tokens = new Set(tokenize(query));
  let s = 0;
  const hay = [
    r.patient_id,
    String(r.age),
    r.condition,
    String(r.clinical_score),
    r.treatment_plan,
  ]
    .join(" ")
    .toLowerCase();
  for (const t of Array.from(tokens)) {
    if (t.length < 2) continue;
    if (hay.includes(t)) s += 3;
    else if (hay.includes(t.replace(/_/g, " "))) s += 2;
    else if (hay.split(/\s+/).some((w) => w.startsWith(t))) s += 1;
  }
  return s;
}

function retrieveContext(
  query: string,
  records: PatientRecord[],
  k: number,
): { context: string; docs: PatientRecord[] } {
  if (records.length === 0) return { context: "", docs: [] };
  const scored = records
    .map((r) => ({ r, s: scoreRecord(query, r) }))
    .sort((a, b) => b.s - a.s);
  const top = scored.slice(0, k).map((x) => x.r);
  const parts = top.map(recordToDoc);
  return { context: parts.join("\n\n---\n\n"), docs: top };
}

function offlineInstrumentScript(context: string): string {
  const lines = [
    "# Biotech instrument integration (browser demo — connect a FastAPI backend for full RAG)",
    "# Retrieved PatientRecord fields from locally stored clinical records:",
  ];
  for (const line of context.split("\n")) {
    lines.push(`# ${line}`);
  }
  lines.push(
    "",
    "def parse_ultrasound_metrics(serialized: bytes) -> dict:",
    '    """Parse ultrasound metrics; extend with vendor-specific fields."""',
    "    return {",
    "        'patient_id': None,",
    "        'age': None,",
    "        'condition': None,",
    "        'clinical_score': None,",
    "        'treatment_plan': None,",
    "    }",
    "",
    "def map_instrument_row_to_patient_record(row: dict) -> dict:",
    '    """Map instrument output to PatientRecord schema field names."""',
    "    return {",
    "        'patient_id': str(row['patient_id']),",
    "        'age': int(row['age']),",
    "        'condition': str(row['condition']),",
    "        'clinical_score': float(row['clinical_score']),",
    "        'treatment_plan': str(row['treatment_plan']),",
    "    }",
  );
  return lines.join("\n");
}

const NOT_FOUND =
  "I could not find that in your uploaded clinical records. Try naming a patient_id, condition, or keyword from your CSV.";

const NO_DATA =
  "No clinical records are loaded in this browser yet. Upload a CSV on the Upload Data page, then ask again.";

const NOT_IN_RECORDS =
  "That question is not answered by your uploaded clinical records. Ask about patients, conditions, treatment plans, ages, or clinical scores.";

function generalReply(query: string): string {
  const q = query.trim().toLowerCase();
  if (/\bweather\b/.test(q)) {
    return (
      "I do not have live weather for your location in this browser-only demo. " +
      "Tell me a city and season, or connect the hosted backend with an API key for richer answers."
    );
  }
  if (
    /\bhow\s*'?s\b.*\b(things|it going|life)\b/.test(q) ||
    /\bhow\s+are\s+you\b/.test(q) ||
    /^\s*(hi|hello|hey)\b/.test(q)
  ) {
    return "Doing well — thanks. Upload a CSV if you want me to summarize your patient rows.";
  }
  if (/\b(thanks|thank you)\b/.test(q)) {
    return "You are welcome.";
  }
  return (
    `${NOT_IN_RECORDS} ` +
    "(This reply is from the built-in offline assistant. Deploy the FastAPI API and set your API URL in Settings for full chat.)"
  );
}

function answerFromContext(query: string, context: string): string {
  if (!context.trim()) return NOT_FOUND;
  return (
    "Here are the most relevant rows from your CSV (browser demo — no server LLM):\n\n" +
    context +
    "\n\nTip: ask a focused question (for example: “list patients with score above 0.8”)."
  );
}

export function offlineChatAnswer(
  query: string,
  opts: { records: PatientRecord[]; instrumentMode: boolean },
): string {
  const stripped = (query || "").trim();
  if (!stripped) return NO_DATA;

  if (!queryTargetsRecords(stripped, opts.instrumentMode)) {
    return generalReply(stripped);
  }

  if (opts.records.length === 0) return NO_DATA;

  const { context, docs } = retrieveContext(stripped, opts.records, 4);
  if (docs.length === 0 || !context.trim()) {
    return (
      "No matching rows were found for that question. " +
      "Try a patient_id, condition, or treatment keyword from your CSV."
    );
  }

  if (opts.instrumentMode) {
    return offlineInstrumentScript(context);
  }
  return answerFromContext(stripped, context);
}
