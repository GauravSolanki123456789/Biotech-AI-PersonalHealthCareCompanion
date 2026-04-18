"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FlaskConical,
  Menu,
  MessageSquare,
  Settings,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Upload Data", icon: Upload },
  { href: "/chat", label: "Chat Console", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-2">
      {nav.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sky-100 text-slate-900 shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [onGitHubPages, setOnGitHubPages] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnGitHubPages(window.location.hostname.endsWith("github.io"));
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
            <FlaskConical className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Medical Lab</p>
            <p className="text-xs text-slate-500">Biotech AI Companion</p>
          </div>
        </div>
        <ScrollArea className="flex-1 py-4">
          <NavLinks />
        </ScrollArea>
        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-500">
            High-contrast clinical workspace. Upload CSV, then query records.
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b border-slate-200 p-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  Medical Lab
                </SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">
              Biotech-AI-PersonalHealthCareCompanion
            </span>
            <span className="text-xs text-slate-500">Dashboard</span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-5xl space-y-4">
            {onGitHubPages && (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
              >
                <p className="font-medium">GitHub Pages hosting</p>
                <p className="mt-1 text-amber-900/90">
                  This site is static HTML and JavaScript. Upload and chat call a
                  separate FastAPI backend — they only work if you deploy the
                  backend elsewhere and rebuild this site with{" "}
                  <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
                    NEXT_PUBLIC_API_URL
                  </code>{" "}
                  pointing to that server (see Settings). If the UI looked
                  unstyled before, ensure{" "}
                  <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
                    .nojekyll
                  </code>{" "}
                  is present in the published output so{" "}
                  <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">
                    _next/
                  </code>{" "}
                  assets are not stripped by Jekyll.
                </p>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
