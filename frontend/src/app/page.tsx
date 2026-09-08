"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  Anchor,
  Fish,
  Loader2,
  Send,
  ShieldAlert,
  Waves,
  Wind,
} from "lucide-react";
import {
  DASHBOARD_ROLES,
  RAMESWARAM,
  isLiveSource,
  type ChatMessage,
  type PfzZone,
  type UserRole,
  type UserStatus,
  type VesselStatus,
} from "@/lib/types";
import {
  FALLBACK_VESSEL,
  getPfzLatest,
  getVesselStatus,
  postQuery,
} from "@/lib/api";

const MarineMap = dynamic(
  () => import("@/components/MarineMap").then((m) => m.MarineMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-varuna-bg">
        <Loader2 className="h-8 w-8 animate-spin text-varuna-accent" />
      </div>
    ),
  },
);

const STATUS_BANNER: Record<
  UserStatus,
  { bg: string; text: string; ta: string; en: string }
> = {
  SAFE: {
    bg: "bg-varuna-safe/15 border-varuna-safe/50 text-varuna-safe",
    text: "text-varuna-safe",
    ta: "கடல் பயணம் பாதுகாப்பானது",
    en: "Safe to Sail",
  },
  CAUTION: {
    bg: "bg-varuna-warn/15 border-varuna-warn/50 text-varuna-warn",
    text: "text-varuna-warn",
    ta: "எச்சரிக்கை",
    en: "Caution Advised",
  },
  CRITICAL: {
    bg: "bg-varuna-danger/15 border-varuna-danger/60 text-varuna-danger",
    text: "text-varuna-danger",
    ta: "அபாயம்",
    en: "DANGER - Do Not Sail",
  },
};

const QUICK_ACTIONS = [
  { label: "🐟 மீன் எங்க?", query: "Where is the best fishing zone today?" },
  { label: "⚠️ Safe-ஆ?", query: "Is it safe to sail right now?" },
  { label: "🚨 Border Check", query: "How far am I from the maritime border?" },
  { label: "🌊 Sea State", query: "What is the current sea state?" },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function FishermanDashboard() {
  const now = useClock();
  const [role, setRole] = useState<UserRole>("fisherman");
  const [vessel, setVessel] = useState<VesselStatus>(FALLBACK_VESSEL);
  const [zones, setZones] = useState<PfzZone[]>([]);
  const [status, setStatus] = useState<UserStatus>("SAFE");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const nearestPfz = useMemo(
    () =>
      zones.length
        ? [...zones].sort((a, b) => a.distance_nm - b.distance_nm)[0]
        : null,
    [zones],
  );

  const refreshTelemetry = useCallback(async () => {
    const [v, z] = await Promise.all([getVesselStatus(), getPfzLatest()]);
    setVessel(v);
    setZones(z);
  }, []);

  useEffect(() => {
    refreshTelemetry();
    const id = setInterval(refreshTelemetry, 30_000);
    return () => clearInterval(id);
  }, [refreshTelemetry]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || loading) return;
      setInput("");
      setLoading(true);
      const userMsg: ChatMessage = {
        id: `${Date.now()}-u`,
        role: "user",
        text,
      };
      setMessages((prev) => [...prev, userMsg].slice(-5));

      const decision = await postQuery({
        query: text,
        role,
        vessel_lat: RAMESWARAM.lat,
        vessel_lon: RAMESWARAM.lon,
        vessel_draft: 2.5,
      });
      setStatus(decision.status);
      setMessages((prev) =>
        [
          ...prev,
          {
            id: `${Date.now()}-v`,
            role: "varuna" as const,
            text: decision.advisory_en,
            advisory_en: decision.advisory_en,
            advisory_ta: decision.advisory_ta,
            status: decision.status,
          },
        ].slice(-5),
      );
      setLoading(false);
    },
    [input, loading, role],
  );

  const banner = STATUS_BANNER[status];

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 p-3 sm:p-4">
      {/* SECTION 1 — HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-varuna-border bg-varuna-panel/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <Waves className="h-6 w-6 text-varuna-accent" />
          <span className="text-lg font-black tracking-widest text-varuna-accent">
            VARUNA
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-slate-300">
            {now ? now.toLocaleTimeString() : "--:--:--"}
          </span>
          <span
            title={`sea-state source: ${vessel.source ?? "unknown"}`}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isLiveSource(vessel.source)
                ? "border-varuna-safe/50 text-varuna-safe"
                : "border-varuna-warn/50 text-varuna-warn"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isLiveSource(vessel.source) ? "bg-varuna-safe" : "bg-varuna-warn"
              }`}
            />
            {isLiveSource(vessel.source) ? "Live Data" : "Cached"}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded-lg border border-varuna-border bg-varuna-bg px-2 py-1 text-xs text-slate-200 outline-none"
            aria-label="Select role"
          >
            {DASHBOARD_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} / {r.labelTa}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* SECTION 2 — ALERT BANNER */}
      <div
        className={`rounded-xl border px-4 py-3 text-center text-sm font-bold ${banner.bg} ${
          status === "CRITICAL" ? "varuna-pulse-critical" : ""
        }`}
      >
        {banner.ta} | {banner.en}
      </div>

      {/* SECTION 3 — STATS CARDS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Waves className="h-4 w-4" />}
          label="Wave Height / அலை"
          value={`${vessel.wave_height_m} m`}
        />
        <StatCard
          icon={<Wind className="h-4 w-4" />}
          label="Wind / காற்று"
          value={`${vessel.wind_knots} kn`}
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="IMBL / எல்லை"
          value={`${vessel.imbl_distance_nm} NM`}
          danger={vessel.imbl_distance_nm < 5}
        />
        <StatCard
          icon={<Fish className="h-4 w-4" />}
          label="Nearest PFZ / மீன்"
          value={nearestPfz ? `${nearestPfz.distance_nm} NM` : "—"}
        />
      </div>

      {/* SECTION 4 — MAP */}
      <section className="h-[45vh] min-h-[320px] overflow-hidden rounded-xl border border-varuna-border">
        <MarineMap
          vesselLat={vessel.lat || RAMESWARAM.lat}
          vesselLon={vessel.lon || RAMESWARAM.lon}
          pfzZones={zones}
          status={status}
        />
      </section>

      {/* SECTION 5 — CHAT */}
      <section className="flex flex-col gap-3 rounded-xl border border-varuna-border bg-varuna-panel/70 p-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.query)}
              disabled={loading}
              className="rounded-full border border-varuna-accent/50 bg-varuna-accent/10 px-3 py-1 text-xs font-medium text-varuna-accent transition hover:bg-varuna-accent/25 disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex max-h-64 min-h-[80px] flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-xs text-slate-500">
              VARUNA-கிட்ட எதுவும் கேளுங்க — உதாரணமா &quot;இன்னைக்கு மீன் எங்க?&quot;
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "self-end bg-varuna-accent/15 text-slate-100"
                  : "self-start border border-varuna-border bg-varuna-bg/60"
              }`}
            >
              {m.role === "varuna" ? (
                <>
                  <p className="text-slate-100" lang="ta">
                    {m.advisory_ta}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{m.advisory_en}</p>
                </>
              ) : (
                m.text
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 self-start text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> VARUNA யோசிக்கிறது…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="VARUNA-கிட்ட கேளுங்க... / Ask VARUNA..."
            className="flex-1 rounded-lg border border-varuna-border bg-varuna-bg px-3 py-2 text-sm text-slate-200 outline-none focus:border-varuna-accent"
          />
          <button
            onClick={() => send()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-varuna-accent px-4 py-2 text-sm font-semibold text-varuna-bg transition hover:brightness-110 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* SECTION 6 — WHATSAPP PROMO */}
      <section className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-700 p-4 text-white">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-white/40 bg-white/10 text-[10px] text-white/70">
            QR CODE
          </div>
          <div className="text-sm">
            <p className="font-bold">
              📱 WhatsApp-ல் VARUNA-வை தொடர்பு கொள்ளுங்கள்
            </p>
            <p className="mt-1 font-mono text-xs text-white/90">
              WhatsApp: +1 415 523 8886
            </p>
            <p className="font-mono text-xs text-white/90">
              Message: join &lt;sandbox-code&gt;
            </p>
            <p className="mt-1 text-[11px] text-white/70">
              Judges can scan and test the live bot during the demo.
            </p>
          </div>
        </div>
      </section>

      <footer className="pb-2 text-center text-[10px] text-slate-600">
        <Anchor className="mr-1 inline h-3 w-3" />
        VARUNA Maritime Intelligence · SIH · offline-first
      </footer>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-varuna-panel/70 p-3 ${
        danger ? "border-varuna-danger/60" : "border-varuna-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-varuna-accent">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {label}
        </span>
      </div>
      <p
        className={`mt-1 font-mono text-lg font-bold ${
          danger ? "text-varuna-danger" : "text-slate-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
