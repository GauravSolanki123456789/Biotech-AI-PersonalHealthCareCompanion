"use client";

import { useCallback, useState } from "react";

import { getApiBaseUrl } from "@/lib/api";

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

  const refresh = useCallback(() => {
    setBase(getApiBaseUrl());
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(base);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={refresh}>
                Refresh
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copy()}>
                {saved ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Default: <code>http://127.0.0.1:8000</code> — must match FastAPI CORS
          origins.
        </p>
      </CardContent>
    </Card>
  );
}
