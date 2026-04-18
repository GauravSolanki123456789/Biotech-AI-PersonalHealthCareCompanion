import type { PatientRecord } from "@/lib/types";

const STORAGE_KEY = "medlab_patient_records_v1";

export const EXPECTED_COLUMNS = [
  "patient_id",
  "age",
  "condition",
  "clinical_score",
  "treatment_plan",
] as const;

export type ParseCsvResult =
  | { ok: true; records: PatientRecord[] }
  | {
      ok: false;
      error: string;
      expected_columns: string[];
      received_columns: string[];
    };

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parsePatientCsvText(text: string): ParseCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return {
      ok: false,
      error: "CSV is empty.",
      expected_columns: [...EXPECTED_COLUMNS],
      received_columns: [],
    };
  }

  const header = parseCsvRow(lines[0]).map((c) => c.replace(/^"|"$/g, "").trim());
  const expected = [...EXPECTED_COLUMNS];
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    return {
      ok: false,
      error: "CSV columns do not match the required PatientRecord schema.",
      expected_columns: expected,
      received_columns: header,
    };
  }

  const records: PatientRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRow(lines[r]).map((c) => c.replace(/^"|"$/g, "").trim());
    if (cells.length === 1 && cells[0] === "") continue;
    if (cells.length !== expected.length) {
      return {
        ok: false,
        error: `Row ${r + 1} has the wrong number of columns.`,
        expected_columns: expected,
        received_columns: header,
      };
    }
    const age = Number.parseInt(cells[1], 10);
    const score = Number.parseFloat(cells[3]);
    if (Number.isNaN(age) || age < 0) {
      return {
        ok: false,
        error: `Invalid age on row ${r + 1}.`,
        expected_columns: expected,
        received_columns: header,
      };
    }
    if (Number.isNaN(score)) {
      return {
        ok: false,
        error: `Invalid clinical_score on row ${r + 1}.`,
        expected_columns: expected,
        received_columns: header,
      };
    }
    records.push({
      patient_id: cells[0],
      age,
      condition: cells[2],
      clinical_score: score,
      treatment_plan: cells[4],
    });
  }

  return { ok: true, records };
}

export async function parsePatientCsvFile(file: File): Promise<ParseCsvResult> {
  const text = await file.text();
  return parsePatientCsvText(text);
}

export function loadPatientRecords(): PatientRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPatientRecord);
  } catch {
    return [];
  }
}

function isPatientRecord(x: unknown): x is PatientRecord {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.patient_id === "string" &&
    typeof o.age === "number" &&
    typeof o.condition === "string" &&
    typeof o.clinical_score === "number" &&
    typeof o.treatment_plan === "string"
  );
}

export function savePatientRecords(records: PatientRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearPatientRecords(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getLocalRecordCount(): number {
  return loadPatientRecords().length;
}
