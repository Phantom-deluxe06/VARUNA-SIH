"use client";

import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Anchor,
  ArrowLeft,
  Compass,
  Fish,
  Layers,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ship,
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
import { WhatsAppQR } from "@/components/WhatsAppQR";

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

const ROLE_QUICK_ACTIONS: Record<UserRole, { label: string; query: string }[]> = {
  fisherman: [
    { label: "🐟 மீன் எங்க?", query: "Where is the best fishing zone today?" },
    { label: "⚠️ Safe-ஆ?", query: "Is it safe to sail right now?" },
    { label: "🚨 Border Check", query: "How far am I from the maritime border?" },
    { label: "🌊 Sea State", query: "What is the current sea state?" },
  ],
  port_pilot: [
    { label: "⚓ UKC Clearance", query: "Check Under-Keel Clearance for Chennai Port with 12m draft" },
    { label: "🚢 Port Entry", query: "Can a vessel enter Chennai Port right now?" },
    { label: "🌊 Thoothukudi Tide", query: "What is the channel depth and tidal surge at Thoothukudi Port?" },
    { label: "📏 14m Draft Test", query: "Is 14m draft safe to berth at Chennai?" },
  ],
  disaster_officer: [
    { label: "🚨 IMBL Breach Scan", query: "Are any vessels breaching the Palk Bay IMBL border?" },
    { label: "📍 Border Coordinates", query: "List the nearest IMBL boundary coordinates" },
    { label: "🛡️ Patrol Status", query: "What is the security status in Palk Bay sector?" },
    { label: "⚠️ High-Risk Zones", query: "Scan for high-risk zones near the maritime boundary" },
  ],
};

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const initialRoleParam = searchParams.get("role") as UserRole | null;
  const initialRole: UserRole =
    initialRoleParam === "port_pilot" || initialRoleParam === "disaster_officer"
      ? initialRoleParam
      : "fisherman";

  const now = useClock();
  const [role, setRole] = useState<UserRole>(initialRole);
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

      const queryLat = role === "port_pilot" ? 13.0827 : RAMESWARAM.lat;
      const queryLon = role === "port_pilot" ? 80.2707 : RAMESWARAM.lon;
      const queryDraft = role === "port_pilot" ? 12.0 : 2.5;

      const decision = await postQuery({
        query: text,
        role,
        vessel_lat: queryLat,
        vessel_lon: queryLon,
        vessel_draft: queryDraft,
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

  const banner = (status && STATUS_BANNER[status]) ? STATUS_BANNER[status] : STATUS_BANNER.SAFE;
  const quickActions = ROLE_QUICK_ACTIONS[role] || ROLE_QUICK_ACTIONS.fisherman;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 p-3 sm:p-4">
      {/* SECTION 1 — HEADER & NAVIGATION */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-varuna-border bg-varuna-panel/80 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-varuna-border bg-varuna-bg/80 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-varuna-accent hover:text-varuna-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Overview</span>
          </Link>
          <div className="flex items-center gap-2">
            <Waves className="h-6 w-6 text-varuna-accent animate-pulse" />
            <span className="text-lg font-black tracking-widest text-varuna-accent">
              VARUNA
            </span>
          </div>
          <span className="rounded bg-varuna-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-varuna-accent border border-varuna-accent/30">
            {role === "fisherman" ? "Fisherman MOS" : role === "port_pilot" ? "Port Hydrographic MOS" : "Coast Guard MOS"}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="font-mono text-xs sm:text-sm text-slate-300">
            {now ? now.toLocaleTimeString() : "--:--:--"}
          </span>
          <span
            title={`sea-state source: ${vessel.source ?? "unknown"}`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isLiveSource(vessel.source)
                ? "border-varuna-safe/50 text-varuna-safe bg-varuna-safe/10"
                : "border-varuna-warn/50 text-varuna-warn bg-varuna-warn/10"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isLiveSource(vessel.source) ? "bg-varuna-safe animate-ping" : "bg-varuna-warn"
              }`}
            />
            {isLiveSource(vessel.source) ? "Live Data" : "Cached"}
          </span>
          <select
            value={role}
            onChange={(e) => {
              const newRole = e.target.value as UserRole;
              setRole(newRole);
              if (newRole === "port_pilot") {
                setStatus("SAFE");
              }
            }}
            className="rounded-lg border border-varuna-accent/50 bg-varuna-bg px-2.5 py-1 text-xs font-semibold text-varuna-accent outline-none hover:border-varuna-accent cursor-pointer shadow-inner"
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
        className={`rounded-xl border px-4 py-3 text-center text-sm font-bold shadow-md transition-all ${banner.bg} ${
          status === "CRITICAL" ? "varuna-pulse-critical" : ""
        }`}
      >
        {role === "port_pilot" ? (
          <span>⚓ துறைமுக வழிகாட்டுதல்: Under-Keel Clearance கணக்கீடு தயார் | Port Pilot Hydrographic Clearance Active</span>
        ) : role === "disaster_officer" ? (
          <span>🛡️ கடலோர காவல்: Palk Bay IMBL எல்லைக் கண்காணிப்பு தயார் | Maritime Boundary Surveillance Active</span>
        ) : (
          <span>{banner.ta} | {banner.en}</span>
        )}
      </div>

      {/* SECTION 3 — STATS CARDS */}
      {role === "fisherman" && (
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
      )}

      {role === "port_pilot" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Ship className="h-4 w-4" />}
            label="Chennai Port Depth"
            value="15.5 m"
          />
          <StatCard
            icon={<Waves className="h-4 w-4" />}
            label="Tidal Surge Offset"
            value="+1.2 m"
          />
          <StatCard
            icon={<Layers className="h-4 w-4" />}
            label="Vessel Draft (Target)"
            value="12.0 m"
          />
          <StatCard
            icon={<ShieldCheck className="h-4 w-4" />}
            label="UKC Clearance (Net)"
            value="+4.7 m (SAFE)"
          />
        </div>
      )}

      {role === "disaster_officer" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<ShieldAlert className="h-4 w-4" />}
            label="IMBL Proximity"
            value={`${vessel.imbl_distance_nm} NM`}
            danger={vessel.imbl_distance_nm < 5}
          />
          <StatCard
            icon={<Compass className="h-4 w-4" />}
            label="Boundary Sector"
            value="Palk Bay"
          />
          <StatCard
            icon={<Waves className="h-4 w-4" />}
            label="Sea State (Wave)"
            value={`${vessel.wave_height_m} m`}
          />
          <StatCard
            icon={<Wind className="h-4 w-4" />}
            label="Wind / Gust"
            value={`${vessel.wind_knots} kn`}
          />
        </div>
      )}

      {/* SECTION 4 — MAP */}
      <section className="h-[45vh] min-h-[320px] overflow-hidden rounded-xl border border-varuna-border shadow-xl">
        <MarineMap
          vesselLat={role === "port_pilot" ? 13.0827 : (vessel.lat || RAMESWARAM.lat)}
          vesselLon={role === "port_pilot" ? 80.2707 : (vessel.lon || RAMESWARAM.lon)}
          pfzZones={zones}
          status={status}
          role={role}
        />
      </section>

      {/* SECTION 5 — CHAT */}
      <section className="flex flex-col gap-3 rounded-xl border border-varuna-border bg-varuna-panel/70 p-4 shadow-lg">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
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
              VARUNA-கிட்ட எதுவும் கேளுங்க — உதாரணமா &quot;இன்னைக்கு மீன் எங்க?&quot; / Ask VARUNA anything...
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "self-end bg-varuna-accent/15 text-slate-100 border border-varuna-accent/30"
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

      {/* SECTION 6 — WHATSAPP PROMO & SCANNABLE QR */}
      <section className="rounded-xl bg-gradient-to-r from-teal-700 via-emerald-800 to-cyan-800 p-4 text-white shadow-xl border border-emerald-500/30">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="shrink-0 bg-varuna-bg/40 p-2.5 rounded-2xl border border-emerald-400/40">
            <WhatsAppQR
              phoneNumber="+14155238886"
              joinCode="join varuna"
              size={110}
            />
          </div>
          <div className="text-sm space-y-1 text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
              <p className="font-extrabold text-base text-emerald-200">
                📱 WhatsApp-ல் VARUNA-வை உடனடியாக சோதிக்கவும்
              </p>
            </div>
            <p className="text-xs text-slate-100">
              கேமராவில் QR குறியீட்டை ஸ்கேன் செய்யுங்கள் அல்லது WhatsApp-ல் இணையுங்கள்:
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-mono">
              <span className="rounded bg-black/40 px-2.5 py-1 text-emerald-300 border border-emerald-500/30">
                WhatsApp: +1 415 523 8886
              </span>
              <span className="rounded bg-black/40 px-2.5 py-1 text-cyan-200 border border-cyan-500/30">
                Text: join &lt;sandbox-code&gt;
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-100/80">
              💡 Fishermen and Judges can scan to ask in Tamil (e.g., &quot;மீன் எங்க?&quot;) or send a live location pin.
            </p>
          </div>
        </div>
      </section>

      <footer className="pb-2 text-center text-[10px] text-slate-600 flex items-center justify-center gap-3">
        <span><Anchor className="mr-1 inline h-3 w-3" />VARUNA Marine Operational System · SIH</span>
        <span>•</span>
        <Link href="/" className="text-varuna-accent hover:underline">Return to Overview</Link>
      </footer>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-varuna-bg">
          <Loader2 className="h-8 w-8 animate-spin text-varuna-accent" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
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
      className={`rounded-xl border bg-varuna-panel/70 p-3 shadow-md transition hover:border-varuna-accent/50 ${
        danger ? "border-varuna-danger/60" : "border-varuna-border"
      }`}
    >
      <div className="flex items-center gap-1.5 text-varuna-accent">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
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
