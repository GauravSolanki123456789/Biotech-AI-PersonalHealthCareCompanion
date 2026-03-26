import type {
  ChatResponse,
  MedicalQuery,
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

export async function uploadCsv(file: File): Promise<UploadSuccessResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${getApiBaseUrl()}/api/upload`, {
    method: "POST",
    body: form,
  });

  const data = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
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
    throw new ApiError(message, res.status, inner);
  }

  return data as UploadSuccessResponse;
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
