"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  fetchHealth,
  fetchStats,
  getApiBaseUrl,
  getSavedApiBaseUrl,
  setSavedApiBaseUrl,
} from "@/lib/api";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPanel() {
  const [resolved, setResolved] = useState(() => getApiBaseUrl());
  const [draft, setDraft] = useState(() => getSavedApiBaseUrl() ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const refreshResolved = useCallback(() => {
    setResolved(getApiBaseUrl());
  }, []);

  useEffect(() => {
    refreshResolved();
  }, [refreshResolved]);

  const copy = async () => {
    await navigator.clipboard.writeText(resolved);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const persistDraft = () => {
    const t = draft.trim().replace(/\/$/, "");
    setSavedApiBaseUrl(t || null);
    refreshResolved();
    setTestOk(null);
    setTestErr(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestOk(null);
    setTestErr(null);
    try {
      const health = await fetchHealth();
      const stats = await fetchStats();
      setTestOk(
        `API reachable (${health.status}). Indexed records: ${stats.records_indexed}. ` +
          `OpenAI: ${stats.openai_configured ? "configured" : "not configured"} on server.`,
      );
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Unable to reach the API. Check the URL, HTTPS, and CORS.";
      setTestErr(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">API connection</CardTitle>
        <CardDescription>
          On this static site, upload and chat work in the browser when no API is
          reachable. To use the full FastAPI backend, deploy it (for example
          Render or Railway), allow CORS for this origin, then save its base URL
          below. Leave blank to use the build default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="draft">API base URL (saved in this browser)</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://your-api.example.com"
              className="font-mono text-sm"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={persistDraft}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft("");
                  setSavedApiBaseUrl(null);
                  refreshResolved();
                  setTestOk(null);
                  setTestErr(null);
                }}
              >
                Clear saved URL
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resolved">Resolved API base (read-only)</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="resolved"
              readOnly
              value={resolved}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={refreshResolved}>
                Refresh
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copy()}>
                {savedFlash ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                onClick={() => void testConnection()}
                disabled={testing}
              >
                {testing ? "Testing…" : "Test connection"}
              </Button>
            </div>
          </div>
        </div>

        {testOk && (
          <p className="text-sm text-emerald-800" role="status">
            {testOk}
          </p>
        )}
        {testErr && (
          <p className="text-sm text-red-700" role="alert">
            {testErr}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Build default:{" "}
          <code className="rounded bg-slate-100 px-1">
            {process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
              "http://127.0.0.1:8000"}
          </code>
          . The backend must list this site&apos;s origin in{" "}
          <code className="rounded bg-slate-100 px-1">CORS_ORIGINS</code>.
        </p>
      </CardContent>
    </Card>
  );
}
