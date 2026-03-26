import { ChatConsole } from "@/components/chat-console";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Chat Console
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          POST <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/api/chat</code>{" "}
          with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">query</code> and optional{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">instrument_mode</code> (boolean).
          Responses use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">answer</code>.
        </p>
      </div>
      <ChatConsole />
    </div>
  );
}
