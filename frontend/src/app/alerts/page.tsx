"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Fish, ShieldAlert, Waves, Wind } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LangToggle from "@/components/ui/LangToggle";
import { usePolling } from "@/hooks/useApi";
import { getPfzLatest, getVesselStatus } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type Tab = "all" | "IMBL" | "Weather" | "PFZ" | "Safety";

interface UiAlert {
  id: string;
  type: Exclude<Tab, "all">;
  title: string;
  desc: string;
  time: number;
  severity: "SAFE" | "CAUTION" | "CRITICAL";
}

const SEV = {
  SAFE: { color: "#2DC653", label: "SAFE" },
  CAUTION: { color: "#FFB703", label: "CAUTION" },
  CRITICAL: { color: "#EF233C", label: "CRITICAL" },
} as const;

const TYPE_ICON = { IMBL: ShieldAlert, Weather: Wind, PFZ: Fish, Safety: Waves } as const;

const TABS: Tab[] = ["all", "IMBL", "Weather", "PFZ", "Safety"];

export default function AlertsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("all");
  const { data: status, loading } = usePolling("alerts-status", getVesselStatus, 60_000);
  const { data: pfz } = usePolling("alerts-pfz", getPfzLatest, 300_000);

  const alerts: UiAlert[] = useMemo(() => {
    const now = Date.now();
    const list: UiAlert[] = [];
    if (status) {
      const lvl = status.status ?? "SAFE";
      list.push({
        id: "imbl",
        type: "IMBL",
        title: "IMBL Distance Advisory",
        desc: `You are ${status.imbl_distance_nm.toFixed(2)} NM from the India–Sri Lanka Maritime Boundary. ${
          status.imbl_distance_nm < 5 ? "Danger buffer nearby — turn back toward Indian waters." : "Continue monitoring bearing."
        }`,
        time: now,
        severity: status.imbl_distance_nm < 2 ? "CRITICAL" : status.imbl_distance_nm < 5 ? "CAUTION" : "SAFE",
      });
      list.push({
        id: "weather-waves",
        type: "Weather",
        title: "Wave Height Report",
        desc: `Current wave height ${status.wave_height_m.toFixed(2)}m with period ${status.wave_period_s.toFixed(1)}s. ${
          status.wave_height_m > 2 ? "Rough seas — small vessels should stay in port." : "Conditions suitable for fishing boats."
        }`,
        time: now - 5 * 60_000,
        severity: status.wave_height_m > 2.5 ? "CRITICAL" : status.wave_height_m > 1.5 ? "CAUTION" : "SAFE",
      });
      list.push({
        id: "weather-wind",
        type: "Weather",
        title: "Wind & Gust Advisory",
        desc: `Wind ${status.wind_knots.toFixed(1)} kn, gusting ${status.gust_knots.toFixed(1)} kn. ${
          status.gust_knots > 20 ? "Strong gusts expected." : "Manageable for open boats."
        }`,
        time: now - 9 * 60_000,
        severity: status.gust_knots > 25 ? "CRITICAL" : status.gust_knots > 15 ? "CAUTION" : "SAFE",
      });
      list.push({
        id: "safety",
        type: "Safety",
        title: "Overall Sea Status",
        desc: `VARUNA overall assessment: ${lvl}. Data source: ${status.source}.`,
        time: now - 12 * 60_000,
        severity: lvl,
      });
    }
    (pfz?.zones ?? []).forEach((z, i) => {
      list.push({
        id: `pfz-${i}`,
        type: "PFZ",
        title: `Potential Fishing Zone ${i + 1}`,
        desc: `${z.distance_nm.toFixed(1)} NM at bearing ${z.bearing.toFixed(0)}° — confidence ${(z.confidence * 100).toFixed(0)}%. Good target for next trip.`,
        time: now - (15 + i * 7) * 60_000,
        severity: "SAFE",
      });
    });
    return list;
  }, [status, pfz]);

  const filtered = tab === "all" ? alerts : alerts.filter((a) => a.type === tab);

  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-screen max-w-4xl px-4 pb-20 pt-24 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-btn border" style={{ borderColor: "var(--border)" }} aria-label="Back">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-2xl font-extrabold sm:text-h3">🌊 {t("marine_alerts")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter alerts">
          {TABS.map((tb) => (
            <button
              key={tb}
              role="tab"
              aria-selected={tab === tb}
              onClick={() => setTab(tb)}
              className="rounded-full border px-4 py-2 text-small font-bold transition-all duration-300"
              style={
                tab === tb
                  ? { background: "var(--cyan-gradient)", color: "#03045E", borderColor: "transparent" }
                  : { borderColor: "var(--border)", color: "var(--muted)" }
              }
            >
              {tb === "all" ? t("all") : tb}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {loading && alerts.length === 0 &&
            [0, 1, 2].map((i) => <div key={i} className="v-card h-28 animate-pulse" />)}
          {!loading && alerts.length === 0 && (
            <div className="v-card p-10 text-center text-body" style={{ color: "var(--muted)" }}>
              ⚠ {t("error_api")}
              <div className="mt-4">
                <button onClick={() => window.location.reload()} className="v-btn-primary px-5 py-2.5 text-small">
                  {t("retry")}
                </button>
              </div>
            </div>
          )}
          {filtered.map((a, i) => {
            const Icon = TYPE_ICON[a.type];
            const sev = SEV[a.severity];
            return (
              <motion.article
                key={a.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`v-card v-card-hover flex items-start gap-4 p-5 ${a.severity === "CRITICAL" ? "animate-pulse" : ""}`}
                style={{ borderLeft: `4px solid ${sev.color}` }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${sev.color}22`, color: sev.color }}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold">{a.title}</h2>
                    <time className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(a.time)}
                    </time>
                  </div>
                  <p className="mt-1 text-small leading-relaxed" style={{ color: "var(--muted)" }}>
                    {a.desc}
                  </p>
                </div>
                <span className="shrink-0 self-center rounded-full px-3 py-1.5 text-xs font-extrabold tracking-wider" style={{ background: `${sev.color}22`, color: sev.color }}>
                  {sev.label}
                </span>
              </motion.article>
            );
          })}
          {!loading && alerts.length > 0 && filtered.length === 0 && (
            <div className="v-card p-10 text-center text-body" style={{ color: "var(--muted)" }}>
              No {tab} alerts — all clear ✅
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

