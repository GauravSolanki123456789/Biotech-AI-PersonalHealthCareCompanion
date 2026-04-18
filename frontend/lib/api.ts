import type {
  ChatResponse,
  MedicalQuery,
  StatsResponse,
  UploadColumnErrorDetail,
  UploadSuccessResponse,
} from "@/lib/types";

export function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000"
  );
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
  const url = `${getApiBaseUrl()}/api/upload`;

  if (typeof XMLHttpRequest === "undefined" || !onProgress) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(url, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw parseUploadError(res.status, data);
    }
    return data as UploadSuccessResponse;
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
      reject(new ApiError("Network error during upload.", 0));
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
        resolve(data as UploadSuccessResponse);
        return;
      }
      reject(parseUploadError(status, data));
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
  const res = await fetch(`${getApiBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: body.query,
      instrument_mode: body.instrument_mode === true,
    }),
  });

  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const body = data as { detail?: unknown };
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : "Chat request failed.";
    throw new ApiError(message, res.status, body?.detail);
  }

  return data as ChatResponse;
}
