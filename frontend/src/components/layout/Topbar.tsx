"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function Topbar({ title, alertCount = 0 }: { title: string; alertCount?: number }) {
  const [q, setQ] = useState("");

  const submit = () => {
    if (!q.trim()) return;
    window.dispatchEvent(new CustomEvent("varuna:ask", { detail: q.trim() }));
    setQ("");
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6"
      style={{ background: "var(--nav-bg)", borderColor: "var(--border)" }}
    >
      <h1 className="hidden text-lg font-extrabold sm:block">{title}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-1 items-center justify-center"
        role="search"
      >
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask VARUNA..."
            aria-label="Ask VARUNA"
            className="v-input w-full py-2 pl-9 pr-3 text-small"
          />
        </div>
      </form>

      <div className="flex items-center gap-2.5">
        <span className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold md:flex" style={{ borderColor: "#2DC653", color: "#2DC653" }}>
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-[#2DC653]" />
          LIVE
        </span>
        <button
          aria-label={`Alerts: ${alertCount} unread`}
          className="relative flex h-9 w-9 items-center justify-center rounded-btn border transition-all duration-300 hover:shadow-card"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
          onClick={() => (window.location.href = "/alerts")}
        >
          <Bell size={18} />
          {alertCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
              style={{ background: "#EF233C" }}
            >
              {alertCount}
            </span>
          )}
        </button>
        <ThemeToggle />
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
          style={{ background: "var(--cyan-gradient)", color: "#03045E" }}
          aria-label="Profile"
        >
          வ
        </span>
      </div>
    </header>
  );
}

/** Listens for "ask" events from topbar search. */
export function useAskEvent(cb: (q: string) => void) {
  useEffect(() => {
    const h = (e: Event) => cb((e as CustomEvent<string>).detail);
    window.addEventListener("varuna:ask", h);
    return () => window.removeEventListener("varuna:ask", h);
  }, [cb]);
}
