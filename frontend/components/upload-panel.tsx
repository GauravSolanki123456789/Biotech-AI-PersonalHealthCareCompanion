"use client";

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

import { ApiError, uploadCsv } from "@/lib/api";
import type { UploadColumnErrorDetail } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recordsImported, setRecordsImported] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnDetail, setColumnDetail] = useState<UploadColumnErrorDetail | null>(
    null
  );

  const resetFeedback = useCallback(() => {
    setMessage(null);
    setRecordsImported(null);
    setError(null);
    setColumnDetail(null);
    setUploadPct(null);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    resetFeedback();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setLoading(true);
    resetFeedback();
    setUploadPct(0);
    try {
      const res = await uploadCsv(file, (pct) => setUploadPct(pct));
      setMessage(res.message);
      setRecordsImported(
        typeof res.records_imported === "number" ? res.records_imported : null,
      );
      setUploadPct(100);
    } catch (err) {
      setUploadPct(null);
      if (err instanceof ApiError) {
        setError(err.message);
        const d = err.detail as UploadColumnErrorDetail | undefined;
        if (
          d &&
          Array.isArray(d.expected_columns) &&
          Array.isArray(d.received_columns)
        ) {
          setColumnDetail(d);
        }
      } else {
        setError("Unable to reach the API. Check backend and CORS.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Clinical CSV upload</CardTitle>
        <CardDescription>
          Posts to <code className="text-xs">/api/upload</code> with form field{" "}
          <code className="text-xs">file</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="csv">CSV file</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                htmlFor="csv"
                className="flex min-h-[120px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center transition hover:border-sky-400 hover:bg-sky-50/50"
              >
                <UploadCloud className="mb-2 h-8 w-8 text-sky-600" />
                <span className="text-sm font-medium text-slate-800">
                  Drop a file or click to browse
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  {file ? file.name : "Only .csv files"}
                </span>
                <input
                  id="csv"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={onFileChange}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={loading || !file}
              className="min-w-[140px] bg-sky-700 hover:bg-sky-800"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadPct !== null && uploadPct < 100
                    ? `Sending… ${uploadPct}%`
                    : "Processing on server…"}
                </>
              ) : (
                "Upload to server"
              )}
            </Button>
            {file && !loading && (
              <span className="text-sm text-slate-600">
                Selected: <strong>{file.name}</strong>
              </span>
            )}
          </div>

          {loading && uploadPct !== null && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-sky-600 transition-[width] duration-150 ease-out"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                File transfer can finish quickly; indexing may take a few seconds
                after that.
              </p>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Document uploaded</p>
                <p className="mt-0.5">{message}</p>
                {recordsImported !== null && (
                  <p className="mt-1 font-mono text-xs text-emerald-800">
                    records_imported: {recordsImported}
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">{error}</p>
                {columnDetail && (
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-semibold text-red-950">
                        expected_columns
                      </p>
                      <ul className="mt-1 list-inside list-disc font-mono text-red-800">
                        {columnDetail.expected_columns.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-red-950">
                        received_columns
                      </p>
                      <ul className="mt-1 list-inside list-disc font-mono text-red-800">
                        {columnDetail.received_columns.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
