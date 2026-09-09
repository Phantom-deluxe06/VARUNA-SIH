"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Wind, Waves, Thermometer, ShieldAlert } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import Topbar, { useAskEvent } from "@/components/layout/Topbar";
import AlertBanner from "@/components/ui/AlertBanner";
import StatCard from "@/components/ui/StatCard";
import ChatWidget from "@/components/ui/ChatWidget";
import PfzTable from "@/components/dashboard/PfzTable";
import AlertsTimeline, { type TimelineAlert } from "@/components/dashboard/AlertsTimeline";
import { usePolling } from "@/hooks/useApi";
import { getVesselStatus, getPfzLatest } from "@/lib/api";
import { useTranslation } from "react-i18next";

const MarineMap = dynamic(() => import("@/components/map/MarineMap"), {
  ssr: false,
  loading: () => <div className="v-card h-full min-h-[420px] animate-pulse" />,
});

let alertId = 1;

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data: status, loading, error, updatedAt } = usePolling("dash-status", getVesselStatus, 30_000);
  const { data: pfz } = usePolling("dash-pfz", getPfzLatest, 300_000);

  // Recent alerts timeline derived from live status transitions
  const [alerts, setAlerts] = useState<TimelineAlert[]>([]);
  const prevStatus = useRef<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!status) return;
    const level = status.status ?? "SAFE";
    if (prevStatus.current === null) {
      setAlerts([
        {
          id: alertId++,
          time: Date.now(),
          type: "Safety",
          severity: level,
          message: `Assessment loaded: SST ${status.sst_celsius.toFixed(1)}°C, wave ${status.wave_height_m.toFixed(2)}m, wind ${status.wind_knots.toFixed(1)}kn, IMBL ${status.imbl_distance_nm.toFixed(2)}NM.`,
        },
      ]);
    } else if (prevStatus.current !== level) {
      const entry: TimelineAlert = {
        id: alertId++,
        time: Date.now(),
        type: "Safety",
        severity: level,
        message: `Status changed ${prevStatus.current} → ${level}. IMBL ${status.imbl_distance_nm.toFixed(2)}NM, wave ${status.wave_height_m.toFixed(2)}m.`,
      };
      setAlerts((a) => [entry, ...a].slice(0, 20));
    }
    prevStatus.current = level;
  }, [status]);

  // PFZ discovery alert
  const pfzCount = pfz?.zones.length ?? 0;
  const pfzAnnounced = useRef(false);
  useEffect(() => {
    if (pfzCount > 0 && !pfzAnnounced.current) {
      pfzAnnounced.current = true;
      setAlerts((a) => [
        {
          id: alertId++,
          time: Date.now(),
          type: "PFZ",
          severity: "SAFE",
          message: `${pfzCount} potential fishing zone${pfzCount > 1 ? "s" : ""} detected near your position.`,
        },
        ...a,
      ]);
    }
  }, [pfzCount]);

  useAskEvent((q) => {
    chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const level = status?.status ?? "SAFE";

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-[260px]">
        <Topbar title={`Dashboard — Overview`} alertCount={alerts.filter((a) => a.severity !== "SAFE").length} />

        <main className="space-y-6 p-4 pb-24 sm:p-6 md:pb-8">
          <AlertBanner status={level} loading={loading} />

          {error && (
            <div className="flex items-center justify-between rounded-card border px-4 py-3 text-small" style={{ borderColor: "#EF233C", color: "#EF233C", background: "rgba(239,35,60,0.08)" }}>
              <span>⚠ {t("error_api")}</span>
              <button onClick={() => window.location.reload()} className="rounded-btn border px-3 py-1.5 text-xs font-bold" style={{ borderColor: "#EF233C" }}>
                {t("retry")}
              </button>
            </div>
          )}

          {/* Stats cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Live marine conditions">
            <StatCard icon={Thermometer} title={t("sea_temp")} value={status ? `${status.sst_celsius.toFixed(1)}°C` : "--"} sub="Warm but fishable" color="#FFB703" loading={loading && !status} trend="up" />
            <StatCard icon={Waves} title={t("wave_height")} value={status ? `${status.wave_height_m.toFixed(2)}m` : "--"} sub="Calm conditions" color="#2DC653" loading={loading && !status} trend="down" />
            <StatCard icon={Wind} title={t("wind_speed")} value={status ? `${status.wind_knots.toFixed(1)} kn` : "--"} sub="Light breeze" color="#0096C7" loading={loading && !status} />
            <StatCard icon={ShieldAlert} title={t("imbl_distance")} value={status ? `${status.imbl_distance_nm.toFixed(2)} NM` : "--"} sub={level === "SAFE" ? "Safe zone" : level === "CAUTION" ? "Approaching boundary" : "DANGER — too close"} color={level === "SAFE" ? "#2DC653" : level === "CAUTION" ? "#FFB703" : "#EF233C"} loading={loading && !status} />
          </section>

          {updatedAt && (
            <p className="text-right text-xs" style={{ color: "var(--muted)" }}>
              Last updated: {new Date(updatedAt).toLocaleTimeString()} · auto-refresh 30s
            </p>
          )}

          {/* Map + Chat */}
          <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="min-h-[420px]">
              <MarineMap vessel={status} pfzZones={pfz?.zones ?? []} height="100%" zoom={9} showControls />
            </div>
            <div id="chat" ref={chatRef}>
              <ChatWidget height="470px" vesselLat={status?.lat} vesselLon={status?.lon} className="h-full" />
            </div>
          </section>

          {/* Bottom row */}
          <section className="grid gap-6 lg:grid-cols-2" id="weather">
            <PfzTable />
            <AlertsTimeline alerts={alerts} />
          </section>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}

