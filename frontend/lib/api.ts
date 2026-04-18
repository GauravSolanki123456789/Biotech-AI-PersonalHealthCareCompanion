import { offlineChatAnswer } from "@/lib/offline-chat";
import {
  parsePatientCsvFile,
  savePatientRecords,
  loadPatientRecords,
} from "@/lib/patient-records-storage";
import type {
  ChatResponse,
  MedicalQuery,
  StatsResponse,
  UploadColumnErrorDetail,
  UploadSuccessResponse,
} from "@/lib/types";

const API_BASE_STORAGE_KEY = "medlab_api_base_url";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
      if (saved) return saved.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
  }
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000"
  );
}

export function getSavedApiBaseUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
    return v ? v.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function setSavedApiBaseUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const t = (url ?? "").trim().replace(/\/$/, "");
    if (!t) window.localStorage.removeItem(API_BASE_STORAGE_KEY);
    else window.localStorage.setItem(API_BASE_STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

async function canReachApi(): Promise<boolean> {
  const base = getApiBaseUrl();
  if (!base) return false;
  const c = new AbortController();
  const tid = setTimeout(() => c.abort(), 2000);
  try {
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      signal: c.signal,
    });
    clearTimeout(tid);
    return res.ok;
  } catch {
    clearTimeout(tid);
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function mirrorRecordsFromFile(file: File): Promise<void> {
  const parsed = await parsePatientCsvFile(file);
  if (!parsed.ok) return;
  savePatientRecords(parsed.records);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("medlab-records-changed"));
  }
}

async function localBrowserUpload(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadSuccessResponse> {
  onProgress?.(15);
  const parsed = await parsePatientCsvFile(file);
  onProgress?.(85);
  if (!parsed.ok) {
    throw new ApiError(parsed.error, 400, {
      error: parsed.error,
      expected_columns: parsed.expected_columns,
      received_columns: parsed.received_columns,
    });
  }
  savePatientRecords(parsed.records);
  onProgress?.(100);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("medlab-records-changed"));
  }
  const n = parsed.records.length;
  return {
    message:
      `Saved ${n} patient record${n === 1 ? "" : "s"} in this browser (offline demo — API upload did not complete).`,
    records_imported: n,
  };
}

function parseUploadError(status: number, data: unknown): ApiError {
  const body = data as { detail?: unknown };
  const inner =
    typeof body?.detail === "object" && body?.detail !== null
      ? (body.detail as UploadColumnErrorDetail)
      : null;
  const message =
    typeof inner?.error === "string"
      ? inner.error
      : typeof body?.detail === "string"
        ? body.detail
        : "Upload failed.";
  return new ApiError(message, status, inner);
}

export async function uploadCsv(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadSuccessResponse> {
  const reachable = await canReachApi();
  if (!reachable) {
    return localBrowserUpload(file, onProgress);
  }

  const url = `${getApiBaseUrl()}/api/upload`;

  if (typeof XMLHttpRequest === "undefined" || !onProgress) {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(url, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        throw parseUploadError(res.status, data);
      }
      await mirrorRecordsFromFile(file);
      return data as UploadSuccessResponse;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      return localBrowserUpload(file, onProgress);
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(100, Math.round((100 * e.loaded) / e.total));
      onProgress(pct);
    };
    xhr.onerror = () => {
      void localBrowserUpload(file, onProgress).then(resolve).catch(reject);
    };
    xhr.onload = () => {
      const status = xhr.status;
      let data: unknown = xhr.response;
      if (data === null || data === "") {
        try {
          data = JSON.parse(xhr.responseText || "null");
        } catch {
          data = null;
        }
      }
      if (status >= 200 && status < 300) {
        void mirrorRecordsFromFile(file).finally(() => {
          resolve(data as UploadSuccessResponse);
        });
        return;
      }
      void localBrowserUpload(file, onProgress).then(resolve).catch(reject);
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/stats`);
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new ApiError("Stats request failed.", res.status, data);
  }
  return data as StatsResponse;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${getApiBaseUrl()}/api/health`);
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new ApiError("Health check failed.", res.status, data);
  }
  return data as { status: string };
}

export async function postChat(body: MedicalQuery): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: body.query,
        instrument_mode: body.instrument_mode === true,
      }),
    });

    const data = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      const b = data as { detail?: unknown };
      const message =
        typeof b?.detail === "string"
          ? b.detail
          : "Chat request failed.";
      throw new ApiError(message, res.status, b?.detail);
    }

    return data as ChatResponse;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
      throw e;
    }
    const records = loadPatientRecords();
    return {
      answer: offlineChatAnswer(body.query, {
        records,
        instrumentMode: body.instrument_mode === true,
      }),
    };
  } finally {
    clearTimeout(timeout);
  }
}
