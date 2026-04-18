"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { ApiError, postChat } from "@/lib/api";
import { getLocalRecordCount } from "@/lib/patient-records-storage";
import { InstrumentCodeBlock } from "@/components/instrument-code-block";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

type Msg = {
  role: "user" | "assistant";
  content: string;
  instrument_mode?: boolean;
};

function stripOptionalMarkdownFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:python)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  return m ? m[1].trim() : t;
}

const NOT_FOUND_PREFIX = "Data not found in the uploaded clinical records.";

function shouldRenderInstrumentCode(content: string, instrumentMode?: boolean) {
  if (!instrumentMode) return false;
  const t = content.trim();
  if (t.startsWith(NOT_FOUND_PREFIX)) return false;
  return true;
}

export function ChatConsole() {
  const [input, setInput] = useState("");
  const [instrumentMode, setInstrumentMode] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    const sync = () => setLocalRows(getLocalRecordCount());
    sync();
    window.addEventListener("medlab-records-changed", sync);
    return () => window.removeEventListener("medlab-records-changed", sync);
  }, []);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setError(null);
    const useInstrument = instrumentMode;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await postChat({
        query: q,
        instrument_mode: useInstrument ? true : undefined,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          instrument_mode: useInstrument,
        },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Unable to reach the API. Verify the backend is running.";
      setError(msg);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: msg, instrument_mode: useInstrument },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden border-slate-200 shadow-md">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">Clinical Q&amp;A</span>
          <span className="mx-2 text-slate-300">·</span>
          <span>
            {localRows > 0
              ? `${localRows} row${localRows === 1 ? "" : "s"} in this browser`
              : "Upload a CSV to enable answers from your data"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Label
            htmlFor="instrument-mode"
            className="cursor-pointer text-sm font-normal text-slate-700"
          >
            Generate Instrument Code
          </Label>
          <Switch
            id="instrument-mode"
            checked={instrumentMode}
            onCheckedChange={setInstrumentMode}
            disabled={loading}
            aria-label="Generate Instrument Code"
          />
        </div>
      </div>
      <ScrollArea className="h-[min(70vh,560px)] bg-slate-50/80">
        <div className="space-y-4 px-4 py-4">
          {messages.length === 0 && !loading && (
            <p className="text-center text-sm text-slate-500">
              Upload a CSV first. Ask about conditions, scores, or treatment plans.
              When no API is available, answers use a lightweight browser demo over
              your saved rows. Enable Generate Instrument Code for Python snippets.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={
                m.role === "user"
                  ? "flex justify-end gap-3"
                  : "flex justify-start gap-3"
              }
            >
              {m.role === "assistant" && (
                <Avatar className="mt-0.5 h-8 w-8 border border-slate-200 bg-white">
                  <AvatarFallback className="bg-sky-100 text-sky-800">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-sky-700 px-4 py-2.5 text-sm text-white shadow-sm"
                    : "max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm"
                }
              >
                {shouldRenderInstrumentCode(m.content, m.instrument_mode) ? (
                  <div className="overflow-hidden rounded-lg">
                    <InstrumentCodeBlock
                      code={stripOptionalMarkdownFences(m.content)}
                    />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
              </div>
              {m.role === "user" && (
                <Avatar className="mt-0.5 h-8 w-8 border border-slate-200 bg-white">
                  <AvatarFallback className="bg-slate-200 text-slate-800">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 border border-slate-200 bg-white">
                <AvatarFallback className="bg-sky-100 text-sky-800">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </div>
                <Skeleton className="h-3 w-[90%]" />
                <Skeleton className="h-3 w-[70%]" />
                <Skeleton className="h-3 w-[55%]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <Separator />
      <div className="bg-white p-3 sm:p-4">
        {error && (
          <p className="mb-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            className="min-h-[88px] flex-1 resize-none border-slate-300 bg-slate-50/80 focus-visible:ring-sky-600"
            placeholder="e.g. Which patients have clinical_score above 0.8?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            aria-label="query"
          />
          <Button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="h-11 shrink-0 bg-sky-700 hover:bg-sky-800 sm:h-[88px] sm:w-24"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Send className="mr-2 h-4 w-4 sm:mr-0" />
                <span className="sm:sr-only">Send</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
