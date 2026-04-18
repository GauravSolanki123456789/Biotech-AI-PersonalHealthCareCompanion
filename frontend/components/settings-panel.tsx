"use client";

import { useCallback, useState } from "react";

import { ApiError, fetchHealth, fetchStats, getApiBaseUrl } from "@/lib/api";

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
  const [base, setBase] = useState(() => getApiBaseUrl());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setBase(getApiBaseUrl());
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(base);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
          : "Unable to reach the API. Check CORS and NEXT_PUBLIC_API_URL.";
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
          The browser calls the backend directly. Set{" "}
          <code className="text-xs">NEXT_PUBLIC_API_URL</code> in{" "}
          <code className="text-xs">.env.local</code> and restart{" "}
          <code className="text-xs">next dev</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="base">Resolved API base (read-only)</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="base"
              readOnly
              value={base}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={refresh}>
                Refresh
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copy()}>
                {saved ? "Copied" : "Copy"}
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
          Default: <code>http://127.0.0.1:8000</code> — must match FastAPI CORS
          origins.
        </p>
      </CardContent>
    </Card>
  );
}
