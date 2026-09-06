"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  Anchor,
  ChevronDown,
  Compass,
  Loader2,
  MapPin,
  Radio,
  Send,
  Ship,
  Waves,
} from "lucide-react";
import type {
  AgentDecision,
  BearingVector,
  MapPoint,
  UserRole,
  UserStatus,
} from "@/lib/types";
import { API_BASE_URL, PFZ_HOTSPOT, PORT_CHENNAI } from "@/lib/types";

const MarineMap = dynamic(() => import("@/components/MarineMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-navy-900">
      <Loader2 className="h-8 w-8 animate-spin text-ocean-400" />
    </div>
  ),
});

const ROLE_LABELS: Record<UserRole, string> = {
  fisherman: "Fisherman",
  port_pilot: "Port Pilot",
  disaster_officer: "Disaster Officer",
};

const ROLE_ROLE_DEFAULTS: Record<UserRole, { lat: number; lon: number; draft?: number }> = {
  fisherman: { lat: 9.15, lon: 79.4 },
  port_pilot: { lat: 13.0827, lon: 80.2707, draft: 13.0 },
  disaster_officer: { lat: 9.5, lon: 79.6 },
};

const PRESETS: Record<UserRole, { label: string; query: string; draft?: number }[]> = {
  fisherman: [{ label: "Check Fishing Hotspot", query: "Where can I catch Tuna and Mackerel today?" }],
  port_pilot: [{ label: "Test UKC Draft 15m", query: "Can I dock at Chennai port channel now?", draft: 15.0 }],
  disaster_officer: [{ label: "Palk Bay Disaster Scan", query: "IMBL Palk Bay zone hazard status?" }],
};

const STATUS_STYLES: Record<UserStatus, { chip: string; icon: typeof Waves }> = {
  SAFE: { chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40", icon: Waves },
  CAUTION: { chip: "bg-amber-500/15 text-amber-400 ring-amber-500/40", icon: AlertTriangle },
  CRITICAL: { chip: "bg-red-500/15 text-red-400 ring-red-500/40", icon: AlertTriangle },
};

export default function CommandCenter() {
  const [role, setRole] = useState<UserRole>("fisherman");
  const [coords, setCoords] = useState(ROLE_ROLE_DEFAULTS.fisherman);
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineLive, setEngineLive] = useState<boolean | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const mapKeyRef = useRef(0);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE_URL}/`)
      .then((r) => (r.ok ? setEngineLive(true) : setEngineLive(false)))
      .catch(() => setEngineLive(false));
  }, []);

  const changeRole = (r: UserRole) => {
    setRole(r);
    setCoords(ROLE_ROLE_DEFAULTS[r]);
    setFocus(null);
    setDecision(null);
    setError(null);
    setQuery("");
  };

  const points: MapPoint[] = useMemoBuildPoints(role, coords, decision);

  const bearing: BearingVector | null = useMemoBuildBearing(decision, coords);

  const runQuery = useCallback(
    async (overrideQuery?: string, overrideDraft?: number) => {
      const q = overrideQuery ?? query;
      const draft = overrideDraft ?? coords.draft;
      if (!q.trim()) {
        setError("Enter a query first.");
        return;
      }
      setLoading(true);
      setError(null);
      setEvidenceOpen(false);
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            user_role: role,
            lat: coords.lat,
            lon: coords.lon,
            ...(draft != null ? { draft } : {}),
          }),
        });
        if (!res.ok) throw new Error(`Engine returned ${res.status}`);
        const data: AgentDecision = await res.json();
        setDecision(data);
        mapKeyRef.current += 1;
        forceRerender((n) => n + 1);
        if (data.active_agent.includes("Port")) setFocus([PORT_CHENNAI.lat, PORT_CHENNAI.lon]);
        else if (typeof data.metrics.target_lat === "number" && typeof data.metrics.target_lon === "number")
          setFocus([coords.lat, coords.lon]);
        else setFocus([coords.lat, coords.lon]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reach VARUNA Core Engine");
        setDecision(null);
      } finally {
        setLoading(false);
      }
    },
    [query, coords, role],
  );

  const ukc = typeof decision?.metrics.ukc_m === "number" ? (decision.metrics.ukc_m as number) : null;
  const riskScore =
    typeof decision?.metrics.compound_risk_score === "number"
      ? (decision.metrics.compound_risk_score as number)
      : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ============ HEADER BAR ============ */}
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-800 bg-navy-900/80 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-ocean-400 to-ocean-700 shadow-lg shadow-ocean-500/20">
            <Waves className="h-5 w-5 text-navy-950" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-slate-100">
              VARUNA <span className="text-ocean-400">MOS</span>
            </h1>
            <p className="text-[10px] text-slate-500">Marine Operational System · SIH26176</p>
          </div>
        </div>

        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
            engineLive == null
              ? "bg-slate-500/10 text-slate-400 ring-slate-600"
              : engineLive
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/40"
                : "bg-red-500/10 text-red-400 ring-red-500/40"
          }`}
        >
          <Radio className={`h-3 w-3 ${engineLive ? "animate-pulse" : ""}`} />
          {engineLive == null ? "Core Engine: ..." : engineLive ? "Core Engine: Live" : "Core Engine: Offline"}
        </span>

        <div className="ml-auto flex items-center gap-4">
          <div className="relative">
            <select
              value={role}
              onChange={(e) => changeRole(e.target.value as UserRole)}
              className="appearance-none rounded-lg border border-slate-700 bg-navy-950 py-1.5 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none transition hover:border-ocean-600 focus:border-ocean-500"
              aria-label="Select role"
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-navy-950 px-3 py-1.5 font-mono text-xs text-ocean-300">
            <MapPin className="h-3.5 w-3.5" />
            {coords.lat.toFixed(2)}°N, {coords.lon.toFixed(2)}°E
          </div>
        </div>
      </header>

      {/* ============ MAIN GRID ============ */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[65fr_35fr]">
        {/* ---- LEFT: MAP ---- */}
        <section className="relative min-h-[300px] overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
          <MarineMap points={points} bearing={bearing} focus={focus} />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-slate-700/70 bg-navy-950/85 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">OPS Area</p>
            <p className="text-xs font-medium text-slate-100">Coastal Tamil Nadu · Palk Bay</p>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-col gap-1.5 text-[11px]">
            {[
              { c: "#22D3EE", t: "PFZ Hotspot" },
              { c: "#38BDF8", t: "Port" },
              { c: "#EF4444", t: "IMBL Boundary" },
            ].map((l) => (
              <span key={l.t} className="flex items-center gap-1.5 self-start rounded bg-navy-950/85 px-2 py-0.5 backdrop-blur">
                <span className="h-2 w-2 rounded-full" style={{ background: l.c }} />
                <span className="text-slate-300">{l.t}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ---- RIGHT: COPILOT & TELEMETRY ---- */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {/* Query console */}
          <div className="rounded-xl border border-slate-800 bg-navy-900/60 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Compass className="h-4 w-4 text-ocean-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Copilot Console</h2>
            </div>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  runQuery();
                }
              }}
              rows={3}
              placeholder={`Ask VARUNA anything, ${ROLE_LABELS[role]}...`}
              className="w-full resize-none rounded-lg border border-slate-700 bg-navy-950 p-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-ocean-500"
            />

            <div className="mt-2.5 flex flex-wrap gap-2">
              {PRESETS[role].map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setQuery(p.query);
                    runQuery(p.query, p.draft ?? coords.draft);
                  }}
                  className="rounded-full border border-ocean-700/60 bg-ocean-500/10 px-3 py-1 text-[11px] font-medium text-ocean-300 transition hover:bg-ocean-500/25"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => runQuery()}
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-ocean-500 to-ocean-700 py-2 text-sm font-semibold text-navy-950 shadow-lg shadow-ocean-600/25 transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "Analyzing..." : "Query Engine"}
            </button>

            {error && (
              <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/30">
                {error} — is the FastAPI backend running on {API_BASE_URL}?
              </p>
            )}
          </div>

          {/* Results */}
          {decision && (
            <div className="rounded-xl border border-slate-800 bg-navy-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {decision.active_agent.includes("Port") ? (
                    <Anchor className="h-4 w-4 text-ocean-400" />
                  ) : decision.active_agent.includes("Hazard") ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Ship className="h-4 w-4 text-ocean-400" />
                  )}
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
                    {decision.active_agent}
                  </h3>
                </div>
                {(() => {
                  const s = STATUS_STYLES[decision.status];
                  const Icon = s.icon;
                  return (
                    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${s.chip}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {decision.status}
                    </span>
                  );
                })()}
              </div>

              {/* English advisory */}
              <div className="rounded-lg border border-slate-700/60 bg-navy-950 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Advisory</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-200">{decision.advisory_english}</p>
              </div>

              {/* Tamil vernacular */}
              <div className="mt-2 rounded-lg border border-ocean-800/50 bg-ocean-950/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ocean-500">வட்டார ஆலோசனை</p>
                <p className="mt-1 text-sm leading-relaxed text-ocean-100" lang="ta">
                  {decision.advisory_tamil}
                </p>
              </div>

              {/* UKC + telemetry metrics */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ukc != null && (
                  <MetricTile label="UKC" value={`${ukc.toFixed(2)} m`} critical={decision.status === "CRITICAL"} icon={Anchor} />
                )}
                {riskScore != null && (
                  <MetricTile label="Risk Score" value={`${riskScore}/100`} critical={riskScore >= 70} icon={Activity} />
                )}
                <MetricTile
                  label="Wave Height"
                  value={`${decision.metrics.wave_height_m} m`}
                  critical={Number(decision.metrics.wave_height_m) > 2}
                  icon={Waves}
                />
                <MetricTile
                  label="Wind"
                  value={`${decision.metrics.wind_speed_knots} kts`}
                  critical={false}
                  icon={Compass}
                />
              </div>

              {/* Evidence trace (expandable) */}
              <button
                onClick={() => setEvidenceOpen((o) => !o)}
                className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-700/60 bg-navy-950 px-3 py-2 text-left transition hover:border-slate-600"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Evidence Trace · {decision.evidence_trace.length} steps
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />
              </button>
              {evidenceOpen && (
                <ol className="mt-2 space-y-1.5 border-l-2 border-ocean-700/60 pl-4">
                  {decision.evidence_trace.map((step, i) => (
                    <li key={i} className="relative text-xs leading-relaxed text-slate-400">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ocean-500" />
                      <span className="font-mono text-ocean-600">{String(i + 1).padStart(2, "0")}</span> {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {!decision && !error && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 p-8 text-center">
              <div>
                <Compass className="mx-auto h-8 w-8 animate-pulse text-slate-700" />
                <p className="mt-3 text-xs text-slate-500">
                  Awaiting first query. Pick a preset or type a natural-language question.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function MetricTile({
  label,
  value,
  critical,
  icon: Icon,
}: {
  label: string;
  value: string;
  critical: boolean;
  icon: typeof Waves;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        critical ? "border-red-500/40 bg-red-500/10" : "border-slate-700/60 bg-navy-950"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3 w-3 ${critical ? "text-red-400" : "text-ocean-500"}`} />
        <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className={`mt-1 font-mono text-sm font-bold ${critical ? "text-red-400" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

/* ---------- map data builders ---------- */

function useMemoBuildPoints(role: UserRole, coords: { lat: number; lon: number }, decision: AgentDecision | null): MapPoint[] {
  const pts: MapPoint[] = [
    PORT_CHENNAI,
    { lat: PFZ_HOTSPOT.lat, lon: PFZ_HOTSPOT.lon, kind: "hotspot", label: `PFZ: ${PFZ_HOTSPOT.species}` },
    {
      lat: coords.lat,
      lon: coords.lon,
      kind: "user",
      label: role === "port_pilot" ? "Vessel" : role === "disaster_officer" ? "Field Unit" : "Fishing Boat",
      status: decision?.status,
    },
  ];
  if (role === "disaster_officer") {
    pts.push({ lat: 9.5, lon: 79.6, kind: "hazard", label: "Palk Bay Watch Node" });
  }
  return pts;
}

function useMemoBuildBearing(
  decision: AgentDecision | null,
  coords: { lat: number; lon: number },
): BearingVector | null {
  if (!decision) return null;
  const hasHotspot =
    typeof decision.metrics.target_lat === "number" &&
    typeof decision.metrics.target_lon === "number" &&
    typeof decision.metrics.bearing_degrees === "number" &&
    typeof decision.metrics.distance_km === "number";
  if (!hasHotspot) return null;
  return {
    from: [coords.lat, coords.lon],
    to: [decision.metrics.target_lat as number, decision.metrics.target_lon as number],
    bearing_degrees: decision.metrics.bearing_degrees as number,
    distance_km: decision.metrics.distance_km as number,
  };
}
